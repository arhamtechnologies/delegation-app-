import { parseQuickCommand } from './updates.mjs';

// Strict, whole-message patterns that answer common requests without calling Claude.
// Anything that does not match exactly returns null and goes to the assistant: a wrong
// match that deletes or completes the wrong thing is worse than one model call.
const word = '[a-z]{2,20}';
const namePattern = `${word}(?: ${word}){0,2}`;
const reservedNames = new Set(['overdue', 'pending', 'open', 'all', 'my', 'the', 'follow', 'followup', 'today', 'yesterday', 'done', 'completed', 'for', 'of']);

const deletePatterns = [/^(?:delete|remove)\s+(?:task\s+)?#(\d+)$/, /^#(\d+)\s+(?:delete|remove)$/];
const closePatterns = [/^(?:mark\s+)?#(\d+)\s+(?:done|closed|complete|completed|ho gaya)$/, /^(?:close|complete|finish)\s+#(\d+)$/];
const cancelPattern = /^cancel\s+#(\d+)$/;
const taskPattern = /^(?:(?:show|task)\s+)?#(\d+)$/;
const checklistDonePatterns = [/^c(\d+)\s+(?:done|ho gaya)$/, /^done\s+c(\d+)$/];
const checklistReopenPatterns = [/^reopen\s+c(\d+)$/, /^c(\d+)\s+reopen$/];
const listPattern = /^(overdue|pending|follow[- ]?up)(?:\s+tasks)?$/;
const misPattern = /^mis(?:\s+report)?(?:\s+(today|this week|this month|last month))?$/;
const personPatterns = [new RegExp(`^tasks (?:of|for) (${namePattern})$`), new RegExp(`^(${namePattern}?)(?: ke)?(?: (?:pending|open|overdue))? tasks$`)];
const misPeriods = { today: 'today', 'this week': 'this_week', 'this month': 'this_month', 'last month': 'last_month' };

function firstRef(patterns, text) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

function validName(value) {
  return Boolean(value) && !value.split(' ').some((part) => reservedNames.has(part));
}

function parseChecklist(text) {
  if (text === 'aaj ka checklist' || text === "today's checklist") return { kind: 'checklist', day: 'today' };
  const match = text.match(new RegExp(`^(?:checklist(?: (today|yesterday|overdue|pending|completed|(${namePattern})))?|(overdue|pending|completed) checklist)$`));
  if (!match) return null;
  const option = match[1] || match[3];
  if (!option) return { kind: 'checklist', day: 'today' };
  if (option === 'today' || option === 'yesterday') return { kind: 'checklist', day: option };
  if (['overdue', 'pending', 'completed'].includes(option)) return { kind: 'checklist', status: option, day: 'today' };
  return validName(option) ? { kind: 'checklist', name: option, day: 'today' } : null;
}

/** @returns {{ kind: string, [key: string]: unknown } | null} */
export function parseCommand(text) {
  const normalized = String(text || '').trim().toLowerCase().replace(/[.!\s]+$/, '').replace(/\s+/g, ' ');
  if (!normalized) return null;

  let ref = firstRef(deletePatterns, normalized);
  if (ref !== null) return { kind: 'task_delete', ref };
  ref = firstRef(closePatterns, normalized);
  if (ref !== null) return { kind: 'task_close', ref };
  ref = firstRef([cancelPattern], normalized);
  if (ref !== null) return { kind: 'task_cancel', ref };
  ref = firstRef([taskPattern], normalized);
  if (ref !== null) return { kind: 'task', ref };
  ref = firstRef(checklistDonePatterns, normalized);
  if (ref !== null) return { kind: 'checklist_done', ref };
  ref = firstRef(checklistReopenPatterns, normalized);
  if (ref !== null) return { kind: 'checklist_reopen', ref };

  const checklist = parseChecklist(normalized);
  if (checklist) return checklist;

  const list = normalized.match(listPattern);
  if (list) return { kind: 'list', status: list[1].startsWith('follow') ? 'followup' : list[1] };

  const mis = normalized.match(misPattern);
  if (mis) return { kind: 'mis', period: misPeriods[mis[1]] || 'this_month' };

  for (const pattern of personPatterns) {
    const match = normalized.match(pattern);
    if (match && validName(match[1])) return { kind: 'person_tasks', name: match[1] };
  }

  return parseQuickCommand(text);
}
