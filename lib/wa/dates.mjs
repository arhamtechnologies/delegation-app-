import { getChecklistBusinessDate } from '../checklist-time.js';

function pad(value) {
  return String(value).padStart(2, '0');
}

function monthRange(year, month) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` };
}

function addDays(dateValue, days) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** MIS date range for a period, in India time. Weeks run Monday to Sunday. */
export function misRange(period, now = new Date()) {
  const today = getChecklistBusinessDate(now);
  const [year, month, day] = today.split('-').map(Number);
  if (period === 'today') return { from: today, to: today };
  if (period === 'last_month') return month === 1 ? monthRange(year - 1, 12) : monthRange(year, month - 1);
  if (period === 'this_week') {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const monday = addDays(today, -((weekday + 6) % 7));
    return { from: monday, to: addDays(monday, 6) };
  }
  return monthRange(year, month);
}
