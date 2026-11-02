import { reportChunkChars } from './daily-report.mjs';

// The full report for one person, sent after the director agrees to see it in chat.
// Items are { title, checklist, due, done } already sorted and formatted (12-hour times) by reads.js.
const sectionLimits = { overdue: 40, pending: 30, completed: 30 };

function shortDate(dateValue) {
  const [year, month, day] = dateValue.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(year, month - 1, day)));
}

const maxTitleChars = 300;
const clipTitle = (title) => { const chars = Array.from(String(title || '')); return chars.length > maxTitleChars ? `${chars.slice(0, maxTitleChars - 1).join('')}…` : chars.join(''); };
const line = (item, kind) => `• ${clipTitle(item.title)}${item.checklist ? ' (checklist)' : ''} — ${kind === 'completed' ? `done ${item.done}` : item.due}`;

/** @returns {string[]} one or more WhatsApp messages */
export function formatPersonFullReport({ person, date, overdue, pending, completed }) {
  const header = `📋 Full report — ${person} · ${shortDate(date)}\nOverdue ${overdue.length} · Pending ${pending.length} · Completed today ${completed.length}`;
  if (!overdue.length && !pending.length && !completed.length) return [`${header}\n\nNothing overdue, pending or completed today.`];

  const sections = [
    { title: 'Overdue', kind: 'overdue', items: overdue },
    { title: 'Pending', kind: 'pending', items: pending },
    { title: 'Completed today', kind: 'completed', items: completed },
  ].filter((section) => section.items.length);

  const chunks = [];
  let current = header;
  // Starts a new message first when `text` (plus `reserve` characters that must stay with it) would not fit.
  const push = (text, { reserve = 0, gap = false } = {}) => {
    if (current && current.length + text.length + reserve + 2 > reportChunkChars) {
      chunks.push(current);
      current = '';
    }
    current = current ? `${current}${gap ? '\n\n' : '\n'}${text}` : text;
  };
  sections.forEach((section) => {
    const limit = sectionLimits[section.kind];
    const shown = section.items.slice(0, limit);
    const lines = shown.map((item) => line(item, section.kind));
    // A title never ends a message on its own: it moves to the next one together with its first item.
    push(`*${section.title} (${section.items.length})*`, { reserve: lines[0].length + 1, gap: true });
    lines.forEach((text) => {
      const before = chunks.length;
      push(text);
      // A section that continues in a new message gets its title again so it reads on its own.
      if (chunks.length > before) current = `*${section.title} (cont.)*\n${current}`;
    });
    if (section.items.length > shown.length) push(`+${section.items.length - shown.length} more (see Tasks in the app)`);
  });
  if (current) chunks.push(current);
  return chunks;
}
