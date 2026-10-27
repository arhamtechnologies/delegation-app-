import Anthropic from '@anthropic-ai/sdk';
import { defaultChecklistTimeZone, getChecklistBusinessDate } from '../checklist-time';
import { runTool, toolDefinitions } from './actions';

export const HAIKU_MODEL = 'claude-haiku-5-5';
const maxSteps = 5;
const roleLabels = { super_admin: 'Director', assigner: 'Director', ea: 'EA' };
let client;

function buildSystemPrompt({ actor, assignees, history, now }) {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: defaultChecklistTimeZone, weekday: 'long' }).format(now);
  return [
    `You are the WhatsApp assistant of a task delegation app. Today is ${weekday}, ${getChecklistBusinessDate(now)}. All times are India time (Asia/Kolkata).`,
    `You are talking to ${actor.name} (${roleLabels[actor.role] || actor.role}).`,
    'Use find_tasks, get_summary, get_updates and get_task to look things up. create_task, update_task, reassign_task, set_status, cancel_task and add_remark only PROPOSE changes; the user confirms afterwards, so never say a change is done. After proposing, reply with at most one short line (or nothing): the app itself lists the proposed changes and asks the user to reply 1 or 2, so do not repeat them.',
    'ETA means the due date/time: set it with create_task or change it with update_task. "Follow up" on a task means show it with get_task (latest remarks), or set_status followup, or add_remark, depending on what the user asks. When a tool returns a ready report (get_updates), send it as is.',
    'Refer to tasks as #N. Convert relative dates (today, kal, parso, Friday) to YYYY-MM-DD. If a tool returns an error or something is unclear, ask one short question instead of guessing.',
    'Priority is only normal, high or critical; map "urgent", "ASAP" or "turant" to critical.',
    "Reply in the user's language (English, Hindi or Hinglish), as short plain WhatsApp text. No markdown headings or tables.",
    `Assignable employees:\n${assignees.map((employee) => `- ${employee.name} (${employee.id})`).join('\n') || '- none'}`,
    `Recent messages, oldest first:\n${history || '(none)'}`,
  ].join('\n\n');
}

export async function runAgent({ text, ...context }) {
  client ||= new Anthropic();
  const proposals = [];
  const toolContext = { ...context, proposals };
  const system = buildSystemPrompt(context);
  const messages = [{ role: 'user', content: text }];
  let reply = '';

  for (let step = 0; step < maxSteps; step += 1) {
    const response = await client.messages.create({ model: HAIKU_MODEL, max_tokens: 1000, system, tools: toolDefinitions, messages });
    const text = response.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim();
    if (text) reply = text;
    const toolUses = response.content.filter((block) => block.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !toolUses.length) break;
    messages.push({ role: 'assistant', content: response.content });
    const results = [];
    for (const toolUse of toolUses) {
      results.push({ type: 'tool_result', tool_use_id: toolUse.id, content: await runTool(toolUse.name, toolUse.input, toolContext) });
    }
    messages.push({ role: 'user', content: results });
  }

  return { reply, proposals };
}
