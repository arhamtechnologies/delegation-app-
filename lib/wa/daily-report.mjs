import { formatChecklistDueAt } from '../checklist-time.js';
import { getUnifiedWorkItemStatus } from '../work-summary.mjs';

// The 6 PM report for the director: every employee's tasks and checklist for the day, in full.
// Pure wording only; reads.js loads the data.
const descriptionChars = 200;
// WhatsApp takes far longer texts, but a few medium messages are easier to read and scroll.
export const reportChunkChars = 3500;

function clip(text) {
  const chars = Array.from(String(text || '').trim().replace(/\s+/g, ' '));
  return chars.length > descriptionChars ? `${chars.slice(0, descriptionChars - 1).join('')}…` : chars.join('');
}

function taskState(task, now) {
  const status = getUnifiedWorkItemStatus(task, now, 'task');
  if (status === 'completed') return { done: true, label: '✅ Completed' };
  if (task.status === 'submitted') return { done: false, label: '🟡 Submitted, awaiting approval' };
  return { done: false, label: status === 'overdue' ? '❌ Not done (overdue)' : '⏳ Not done yet' };
}

function taskBlock(task, now) {
  const state = taskState(task, now);
  const due = task.original_eta || task.eta;
  const lines = [`${state.done ? '✅' : '❌'} ${task.title}`];
  const description = clip(task.description);
  if (description) lines.push(`   ${description}`);
  lines.push(`   Due: ${formatChecklistDueAt(due)}`);
  if (task.original_eta && Date.parse(task.original_eta) !== Date.parse(task.eta)) lines.push(`   Revised ETA: ${formatChecklistDueAt(task.eta)}`);
  lines.push(`   ${state.label}`);
  return { done: state.done, text: lines.join('\n') };
}

function checklistLine(item, now) {
  const status = getUnifiedWorkItemStatus({ ...item, kind: 'checklist' }, now, 'checklist');
  const time = item.due_at ? formatChecklistDueAt(item.due_at).split(' · ')[1] : null;
  const mark = status === 'completed' ? '✅' : '❌';
  const note = status === 'completed' ? '' : status === 'overdue' ? ' (not done)' : ' (pending)';
  return { done: status === 'completed', text: `${mark} ${item.task}${time ? ` · ${time}` : ''}${note}` };
}

/**
 * @param {{ date: string, now: Date, employees: { id: string, name: string }[],
 *   tasks: { assignee_id: string, title: string, description?: string, status: string, eta: string, original_eta?: string, completed_at?: string }[],
 *   checklist: { employee_id: string, task: string, status: string, due_at?: string, due_date: string, completed_at?: string }[],
 *   olderChecklistOpen: Map<string, number> }} input
 * @returns {string[]} the report split into messages at person boundaries
 */
export function formatDailyReport({ date, now, employees, tasks, checklist, olderChecklistOpen = new Map() }) {
  const byPerson = new Map(employees.map((employee) => [employee.id, { name: employee.name, tasks: [], checklist: [] }]));
  const person = (id, name) => {
    if (!byPerson.has(id)) byPerson.set(id, { name: name || '-', tasks: [], checklist: [] });
    return byPerson.get(id);
  };
  for (const task of tasks) person(task.assignee_id, task.assignee?.name).tasks.push(taskBlock(task, now));
  for (const item of checklist) person(item.employee_id, item.employee?.name).checklist.push(checklistLine(item, now));

  const totals = { tasks: 0, tasksDone: 0, checklist: 0, checklistDone: 0 };
  const sections = [];
  const idle = [];
  for (const [id, entry] of byPerson) {
    const older = olderChecklistOpen.get(id) || 0;
    if (!entry.tasks.length && !entry.checklist.length && !older) { idle.push(entry.name); continue; }
    const tasksDone = entry.tasks.filter((task) => task.done).length;
    const checklistDone = entry.checklist.filter((item) => item.done).length;
    Object.assign(totals, {
      tasks: totals.tasks + entry.tasks.length,
      tasksDone: totals.tasksDone + tasksDone,
      checklist: totals.checklist + entry.checklist.length,
      checklistDone: totals.checklistDone + checklistDone,
    });
    const counts = [entry.tasks.length && `Tasks ${tasksDone}/${entry.tasks.length} done`, entry.checklist.length && `Checklist ${checklistDone}/${entry.checklist.length} done`].filter(Boolean);
    const lines = [`*${entry.name}*${counts.length ? ` — ${counts.join(' · ')}` : ''}`];
    if (entry.tasks.length) lines.push('Tasks:', ...entry.tasks.map((task) => task.text));
    if (entry.checklist.length) lines.push('Checklist:', ...entry.checklist.map((item) => item.text));
    if (older) lines.push(`⚠️ ${older} checklist item${older === 1 ? '' : 's'} from earlier days still not done`);
    sections.push(lines.join('\n'));
  }
  sections.sort((left, right) => left.localeCompare(right));
  if (idle.length) sections.push(`No tasks or checklist today: ${idle.sort((left, right) => left.localeCompare(right)).join(', ')}`);

  const [year, month, day] = date.split('-').map(Number);
  const label = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(year, month - 1, day)));
  const header = `🕕 Daily report · ${label} (6 PM)\nTasks ${totals.tasksDone}/${totals.tasks} done · Checklist ${totals.checklistDone}/${totals.checklist} done`;

  const chunks = [];
  let current = header;
  for (const section of sections) {
    if (current && current.length + section.length + 2 > reportChunkChars) {
      chunks.push(current);
      current = section;
    } else {
      current = current ? `${current}\n\n${section}` : section;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
