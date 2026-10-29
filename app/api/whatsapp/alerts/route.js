import { createHash, timingSafeEqual } from 'node:crypto';
import { createSupabaseAdminClient } from '../../../../lib/supabase-server';
import { runWhatsAppAlerts } from '../../../../lib/wa/alerts-run';

export const runtime = 'nodejs';
export const maxDuration = 60;

function digest(value) {
  return createHash('sha256').update(value).digest();
}

// Called every minute by Supabase pg_cron with a token kept in Supabase Vault, so no Vercel
// variable has to match it. CRON_SECRET is accepted too, for a manual or Vercel-scheduled run.
async function authorized(request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && timingSafeEqual(digest(token), digest(cronSecret))) return true;
  const { data, error } = await createSupabaseAdminClient().rpc('wa_alerts_token_valid', { p_token: token });
  if (error) console.error('WhatsApp alerts token check failed.', { code: error.code, message: error.message });
  return data === true;
}

export async function POST(request) {
  if (!(await authorized(request))) return Response.json({ ok: false }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await runWhatsAppAlerts()) });
  } catch (error) {
    console.error('WhatsApp alerts run failed.', { code: error?.code, message: error?.message });
    return Response.json({ ok: false }, { status: 500 });
  }
}
