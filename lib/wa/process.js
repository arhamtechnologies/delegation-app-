import { createSupabaseAdminClient } from '../supabase-server';
import { taskManagerRoles } from '../task-server';
import { buildDailyUpdate, executeProposals, loadAssignees } from './actions';
import { runAgent } from './agent';
import { getTransport } from './transport';
import { helpText, parseQuickCommand, resolveUpdateDate } from './updates.mjs';

const pendingTtlMs = 10 * 60 * 1000;
const confirmPattern = /^(1|yes|y|haan|han|ha|ji|confirm|ok|okay)$/;
const cancelPattern = /^(2|no|n|nahi|nahin|cancel)$/;

async function reply(admin, transport, chatId, body) {
  await transport.sendText(chatId, body);
  const { error } = await admin.from('wa_messages').insert({ chat_id: chatId, sender: 'bot', direction: 'out', body });
  if (error) console.error('WhatsApp outgoing log failed.', { code: error.code, message: error.message });
}

async function loadActor(admin, chatId) {
  const { data, error } = await admin.from('employees').select('id,name,role,active,auth_user_id').eq('whatsapp_chat_id', chatId).maybeSingle();
  if (error) throw error;
  return data?.active === true && data.auth_user_id && taskManagerRoles.has(data.role) ? data : null;
}

async function loadHistory(admin, chatId, excludeId) {
  const { data, error } = await admin
    .from('wa_messages')
    .select('direction,body')
    .eq('chat_id', chatId)
    .neq('id', excludeId)
    .order('created_at', { ascending: false })
    .limit(8);
  if (error) throw error;
  return (data || []).reverse().map((message) => `${message.direction === 'in' ? 'User' : 'Bot'}: ${String(message.body || '').slice(0, 500)}`).join('\n');
}

async function loadPending(admin, chatId, actorId) {
  const { data, error } = await admin
    .from('wa_pending_actions')
    .select('id')
    .eq('chat_id', chatId)
    .eq('actor_employee_id', actorId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Conditional update so a pending action is only ever handled once.
async function settlePending(admin, pendingId, status) {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from('wa_pending_actions')
    .update({ status, handled_at: nowIso })
    .eq('id', pendingId)
    .eq('status', 'pending')
    .gt('expires_at', nowIso)
    .select('id,actions')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function processIncomingMessage({ chatId, text, messageId }) {
  const transport = getTransport();
  try {
    const admin = createSupabaseAdminClient();
    if (!text) return await reply(admin, transport, chatId, 'Please send text only.');

    const actor = await loadActor(admin, chatId);
    if (!actor) return await reply(admin, transport, chatId, 'This number is not linked to a director or EA account.');

    const normalized = text.trim().toLowerCase().replace(/[.!\s]+$/, '');
    const pending = await loadPending(admin, chatId, actor.id);
    if (pending) {
      if (confirmPattern.test(normalized)) {
        const claimed = await settlePending(admin, pending.id, 'confirmed');
        if (!claimed) return await reply(admin, transport, chatId, 'That request was already handled or has expired.');
        const lines = await executeProposals(admin, actor, claimed.actions || []);
        return await reply(admin, transport, chatId, lines.join('\n') || 'Nothing to do.');
      }
      if (cancelPattern.test(normalized)) {
        const cancelled = await settlePending(admin, pending.id, 'cancelled');
        return await reply(admin, transport, chatId, cancelled ? 'Cancelled. No changes made.' : 'That request was already handled or has expired.');
      }
    } else if (normalized === '1' || normalized === '2') {
      return await reply(admin, transport, chatId, 'Nothing is waiting for confirmation (requests expire after 10 minutes).');
    }

    // Fixed commands skip the model and leave any pending confirmation open.
    const command = parseQuickCommand(text);
    if (command?.kind === 'help') return await reply(admin, transport, chatId, helpText);
    if (command?.kind === 'updates') return await reply(admin, transport, chatId, await buildDailyUpdate(admin, { date: resolveUpdateDate(command.day) }));
    if (pending) await settlePending(admin, pending.id, 'expired');

    const [assignees, history] = await Promise.all([loadAssignees(admin), loadHistory(admin, chatId, messageId)]);
    const { reply: agentReply, proposals } = await runAgent({ text, admin, actor, assignees, history, now: new Date() });
    if (!proposals.length) return await reply(admin, transport, chatId, agentReply || 'Sorry, I could not understand that. Please rephrase.');

    const { error } = await admin.from('wa_pending_actions').insert({
      chat_id: chatId,
      actor_employee_id: actor.id,
      actions: proposals,
      expires_at: new Date(Date.now() + pendingTtlMs).toISOString(),
    });
    if (error) throw error;
    const summary = proposals.map((proposal, index) => `${index + 1}. ${proposal.label}`).join('\n');
    await reply(admin, transport, chatId, `${agentReply ? `${agentReply}\n\n` : ''}${summary}\n\nReply 1 to confirm, 2 to cancel.`);
  } catch (error) {
    console.error('WhatsApp message processing failed.', { code: error?.code, message: error?.message });
    await transport.sendText(chatId, 'Sorry, something went wrong. Please try again.').catch((sendError) => {
      console.error('WhatsApp apology send failed.', { message: sendError?.message });
    });
  }
}
