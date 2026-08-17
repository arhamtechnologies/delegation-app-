export const defaultChecklistTimeZone = 'Asia/Kolkata';

export function getDateTimeParts(value, timeZone = defaultChecklistTimeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(value);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

export function getChecklistBusinessDate(value = new Date(), timeZone = defaultChecklistTimeZone) {
  const parts = getDateTimeParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getNextBusinessDate(dateValue) {
  const dateParts = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateParts) return null;
  const date = new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3])));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== Number(dateParts[1]) || date.getUTCMonth() !== Number(dateParts[2]) - 1 || date.getUTCDate() !== Number(dateParts[3])) return null;
  date.setUTCDate(date.getUTCDate() + 1);
  return getChecklistBusinessDate(date, 'UTC');
}

export function isChecklistDueOnDate(template, dateValue) {
  if (!template?.start_date || dateValue < template.start_date) return false;
  const [year, month, day] = String(dateValue).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (template.frequency === 'daily') return true;
  if (template.frequency === 'weekly') return date.getUTCDay() === Number(template.weekday);
  if (template.frequency === 'monthly') {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthlyDays = Array.isArray(template.monthly_days) && template.monthly_days.length ? template.monthly_days : [template.day_of_month];
    return monthlyDays.some((monthlyDay) => day === Math.min(Number(monthlyDay), lastDay));
  }
  if (template.frequency !== 'every_15_days') return false;
  const [startYear, startMonth, startDay] = String(template.start_date).split('-').map(Number);
  const startDate = Date.UTC(startYear, startMonth - 1, startDay);
  return Math.round((date.getTime() - startDate) / 86400000) % 15 === 0;
}

export function localDateTimeToIso(dateValue, timeValue, timeZone = defaultChecklistTimeZone) {
  if (!dateValue || !timeValue) return null;
  const dateMatch = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(timeValue).match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!dateMatch || !timeMatch) return null;
  const [year, month, day] = dateMatch.slice(1).map(Number);
  const [hour, minute] = timeMatch.slice(1).map(Number);
  if (hour > 23 || minute > 59) return null;

  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const represented = getDateTimeParts(new Date(localAsUtc), timeZone);
  const representedAsUtc = Date.UTC(
    Number(represented.year),
    Number(represented.month) - 1,
    Number(represented.day),
    Number(represented.hour),
    Number(represented.minute),
    Number(represented.second),
  );
  const offset = representedAsUtc - localAsUtc;
  return new Date(localAsUtc - offset).toISOString();
}

export function formatChecklistDueAt(value, { timeZone = defaultChecklistTimeZone, includeYear = false } = {}) {
  if (!value) return 'No due date';
  const dueAt = new Date(value);
  if (Number.isNaN(dueAt.getTime())) return 'No due date';
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(dueAt);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(dueAt);
  return `${date} · ${time}`;
}

export function formatChecklistTime(value) {
  if (!value) return 'Time not specified';
  const [hour, minute] = String(value).split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return 'Time not specified';
  const date = new Date(Date.UTC(2026, 0, 1, hour, minute));
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' }).format(date);
}
