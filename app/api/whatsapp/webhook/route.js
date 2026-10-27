import { createHash, timingSafeEqual } from 'node:crypto';
import { after } from 'next/server';
import { createSupabaseAdminClient } from '../../../../lib/supabase-server';
import { processIncomingMessage } from '../../../../lib/wa/process';

export const runtime = 'nodejs';
export const maxDuration = 60;

function digest(value) {
  return createHash('sha256').update(value).digest();
}

function tokenMatches(request) {
  const expected = process.env.GREEN_WEBHOOK_TOKEN;
  const provided = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return Boolean(expected && provided) && timingSafeEqual(digest(provided), digest(expected));
}

function allowedChatIds() {
  return new Set((process.env.ALLOWED_CHAT_IDS || '').split(',').map((value) => value.trim()).filter(Boolean));
}

function extractText(messageData) {
  const text = messageData?.textMessageData?.textMessage ?? messageData?.extendedTextMessageData?.text;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}

function ok() {
  return Response.json({ ok: true });
}

export async function POST(request) {
  if (!tokenMatches(request)) return Response.json({ ok: false }, { status: 401 });

  let payload;
  try { payload = await request.json(); } catch { return ok(); }

  if (payload?.typeWebhook !== 'incomingMessageReceived') {
    console.log(`WhatsApp webhook ignored: ${payload?.typeWebhook || 'unknown'}`);
    return ok();
  }

  const chatId = payload?.senderData?.chatId;
  const idMessage = payload?.idMessage;
  if (!chatId || !idMessage) return ok();
  if (!allowedChatIds().has(chatId)) {
    console.log('WhatsApp webhook dropped a message from a chat that is not allowed.');
    return ok();
  }

  const text = extractText(payload.messageData);
  try {
    const { data: row, error } = await createSupabaseAdminClient()
      .from('wa_messages')
      .insert({
        wa_message_id: idMessage,
        chat_id: chatId,
        sender: payload.senderData?.sender || chatId,
        direction: 'in',
        body: text ?? `[${payload.messageData?.typeMessage || 'non-text'}]`,
      })
      .select('id')
      .single();
    if (error?.code === '23505') return ok();
    if (error) throw error;
    after(() => processIncomingMessage({ chatId, text, messageId: row.id }));
  } catch (error) {
    console.error('WhatsApp webhook failed.', { code: error?.code, message: error?.message });
  }
  return ok();
}
