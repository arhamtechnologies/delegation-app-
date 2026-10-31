import { createHash, timingSafeEqual } from 'node:crypto';
import { createSupabaseAdminClient, getBearerToken } from '../../../../../lib/supabase-server';
import { cleanupTaskProofs } from '../../../../../lib/server/task-proof-cleanup.mjs';

export const runtime = 'nodejs';
export const maxDuration = 120;

function digest(value) {
  return createHash('sha256').update(value).digest();
}

// Vercel Cron calls this daily with `Authorization: Bearer $CRON_SECRET`.
export async function GET(request) {
  const token = getBearerToken(request);
  const secret = process.env.CRON_SECRET;
  if (!secret || !token || !timingSafeEqual(digest(token), digest(secret))) return Response.json({ ok: false }, { status: 401 });

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return Response.json({ ok: false, error: 'Supabase admin access is not configured.' }, { status: 503 });
  }

  const result = await cleanupTaskProofs(admin);
  if (result.error) {
    console.error('Task proof cleanup failed.', { code: result.error.code, message: result.error.message, removed: result.removed });
    return Response.json({ ok: false, removed: result.removed }, { status: 500 });
  }
  return Response.json({ ok: true, removed: result.removed });
}
