import { createSupabaseAdminClient } from '../supabase-server';
import { taskManagerRoles } from '../task-server';
import { loadAssignees } from './common';
import { executeProposals } from './execute';
import { runAgent } from './agent';
import { parseCommand } from './commands.mjs';
import { getPersonFullReport } from './reads';
import { runCommand } from './run-command';
import { getTransport } from './transport';

const pendingTtlMs = 10 * 60 * 1000;
const confirmPattern = /^(1|yes|y|haan|han|ha|ji|confirm|ok|okay)$/;
const cancelPattern = /^(2|no|n|nahi|nahin|cancel)$/;

async function reply(admin, transport, chatId, body, usage) {
  await transport.sendText(chatId, body);
  // Token columns stay null for replies that needed no model call.
  const { error } = await admin.from('wa_messages').insert({ chat_id: chatId, sender: 'bot', direction: 'out', body, ...(usage || {}) });
  if (error) console.error('WhatsApp outgoing log failed.', { code: error.code, message: error.message });
}

// A read can end by offering more ("show Varun's full report here?"). The offer is stored like a
// confirmation so the director answers with the usual 1 / 2; a newer offer replaces anything still open.
async function replyWithOffers(admin, transport, chatId, actor, pending, text, offers, usage) {
  if (!offers?.length) return reply(admin, transport, chatId, text, usage);
  if (pending) await settlePending(admin, pending.id, 'expired');
  const { error } = await admin.from('wa_pending_actions').insert({
    chat_id: chatId,
    actor_employee_id: actor.id,
    actions: offers.slice(0, 1),
    expires_at: new Date(Date.now() + pendingTtlMs).toISOString(),
  });
  if (error) throw error;
  return reply(admin, transport, chatId, text, usage);
}

const isReportOffer = (actions) => actions.length > 0 && actions.every((action) => action.kind === 'person_report');

async function sendPersonReports(admin, transport, chatId, actions) {
  const assignees = await loadAssignees(admin);
  for (const offer of actions) {
    const employee = assignees.find((candidate) => candidate.id === offer.employeeId);
    if (!employee) {
      await reply(admin, transport, chatId, `${offer.name || 'That employee'} is no longer available.`);
      continue;
    }
    for (const message of await getPersonFullReport(admin, employee)) await reply(admin, transport, chatId, message);
  }
}

async function loadActor(admin, chatId) {
  // A linked number (wa_chat_links) acts as that manager account under its own name. Checked first so a
  // login's own number can carry a person's name too (the Administrator number is Ankit Jain's).
  const link = await admin.from('wa_chat_links').select('display_name,employee:employees(id,name,role,active,auth_user_id)').eq('chat_id', chatId).maybeSingle();
  if (link.error) throw link.error;
  let actor = link.data?.employee ? { ...link.data.employee, name: link.data.display_name || link.data.employee.name } : null;
  if (!actor) {
    const { data, error } = await admin.from('employees').select('id,name,role,active,auth_user_id').eq('whatsapp_chat_id', chatId).maybeSingle();
    if (error) throw error;
    actor = data;
  }
  return actor?.active === true && actor.auth_user_id && taskManagerRoles.has(actor.role) ? { ...actor, chatId } : null;
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
  return (data || []).reverse();
}

async function loadPending(admin, chatId, actorId) {
  const { data, error } = await admin
    .from('wa_pending_actions')
    .select('id,actions')
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
        if (isReportOffer(claimed.actions || [])) return await sendPersonReports(admin, transport, chatId, claimed.actions);
        const lines = await executeProposals(admin, actor, claimed.actions || []);
        return await reply(admin, transport, chatId, lines.join('\n') || 'Nothing to do.');
      }
      if (cancelPattern.test(normalized)) {
        const cancelled = await settlePending(admin, pending.id, 'cancelled');
        if (cancelled && isReportOffer(cancelled.actions || [])) return await reply(admin, transport, chatId, 'Okay. You can see the full list in the app under Tasks.');
        return await reply(admin, transport, chatId, cancelled ? 'Cancelled. No changes made.' : 'That request was already handled or has expired.');
      }
    } else if (normalized === '1' || normalized === '2') {
      return await reply(admin, transport, chatId, 'Nothing is waiting for confirmation (requests expire after 10 minutes).');
    }

    // Fixed commands skip the model entirely and leave any pending confirmation open for reads.
    const command = parseCommand(text);
    const readOnly = command && ['help', 'updates', 'task', 'list', 'person_tasks', 'checklist', 'mis', 'stats'].includes(command.kind);
    // An unanswered report offer is dropped by anything but 1 / 2, so a later "ok" cannot trigger it; a pending change survives reads.
    if (pending && (!readOnly || isReportOffer(pending.actions || []))) await settlePending(admin, pending.id, 'expired');

    const assignees = await loadAssignees(admin);
    const proposals = [];
    const offers = [];
    let agentReply = '';
    let usage;
    if (command) {
      // Never replace someone's pending change with a report offer: show the old "see the app" text instead.
      const offersAllowed = !pending || isReportOffer(pending.actions || []);
      const result = await runCommand(command, { admin, actor, assignees, proposals, offers: offersAllowed ? offers : undefined });
      if (!proposals.length) return await replyWithOffers(admin, transport, chatId, actor, pending, result, offers);
    } else {
      const history = await loadHistory(admin, chatId, messageId);
      const agent = await runAgent({ text, admin, actor, assignees, history, now: new Date() });
      usage = agent.usage;
      if (agent.directReply) return await replyWithOffers(admin, transport, chatId, actor, pending, agent.directReply, agent.proposals.length ? [] : agent.offers, usage);
      if (!agent.proposals.length) return await reply(admin, transport, chatId, agent.reply || 'Sorry, I could not understand that. Please rephrase.', usage);
      proposals.push(...agent.proposals);
      agentReply = agent.reply;
    }

    const { error } = await admin.from('wa_pending_actions').insert({
      chat_id: chatId,
      actor_employee_id: actor.id,
      actions: proposals,
      expires_at: new Date(Date.now() + pendingTtlMs).toISOString(),
    });
    if (error) throw error;
    const summary = proposals.map((proposal, index) => `${index + 1}. ${proposal.label}`).join('\n');
    await reply(admin, transport, chatId, `${agentReply ? `${agentReply}\n\n` : ''}${summary}\n\nReply 1 to confirm, 2 to cancel.`, usage);
  } catch (error) {
    console.error('WhatsApp message processing failed.', { code: error?.code, message: error?.message });
    await transport.sendText(chatId, 'Sorry, something went wrong. Please try again.').catch((sendError) => {
      console.error('WhatsApp apology send failed.', { message: sendError?.message });
    });
  }
}
