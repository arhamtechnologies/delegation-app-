const eligibleChecklistFrequencies = new Set(['weekly', 'every_15_days', 'monthly']);

function parseDateOnly(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return null;
  return date;
}

function formatDateOnly(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function getDateInTimeZone(value, timeZone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getTimeInTimeZone(value, timeZone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '23:59:59';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.hour}:${values.minute}:${values.second}`;
}

function localDateTimeToIso(dateValue, timeValue, timeZone) {
  const dateMatch = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(timeValue || '').match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!dateMatch || !timeMatch) return null;
  const localAsUtc = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    Number(timeMatch[3] || 0),
  );
  const representedParts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(localAsUtc));
  const represented = Object.fromEntries(representedParts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(Number(represented.year), Number(represented.month) - 1, Number(represented.day), Number(represented.hour), Number(represented.minute), Number(represented.second));
  return new Date(localAsUtc - (representedAsUtc - localAsUtc)).toISOString();
}

export function isSundayDate(dateValue) {
  const date = parseDateOnly(dateValue);
  return Boolean(date && date.getUTCDay() === 0);
}

export function getNextWorkingDate(dateValue, holidayDates = []) {
  const date = parseDateOnly(dateValue);
  if (!date) return null;
  const holidays = holidayDates instanceof Set ? holidayDates : new Set(holidayDates);
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (date.getUTCDay() === 0 || holidays.has(formatDateOnly(date)));
  return formatDateOnly(date);
}

export function getOriginalScheduledDate(workItem, timeZone = 'Asia/Kolkata') {
  if (workItem?.kind === 'checklist' || workItem?.sourceType === 'checklist') {
    return workItem.due_date || workItem.checklistItem?.due_date || null;
  }
  return workItem?.eta ? getDateInTimeZone(workItem.eta, timeZone) : null;
}

export function isFollowUpEligible(workItem, holidayDates = [], timeZone = 'Asia/Kolkata') {
  const originalScheduledDate = getOriginalScheduledDate(workItem, timeZone);
  if (!originalScheduledDate) return false;
  const holidays = holidayDates instanceof Set ? holidayDates : new Set(holidayDates);
  if (!isSundayDate(originalScheduledDate) && !holidays.has(originalScheduledDate)) return false;
  if (workItem?.kind !== 'checklist' && workItem?.sourceType !== 'checklist') return true;
  const template = workItem.template || workItem.checklistItem?.template;
  return eligibleChecklistFrequencies.has(template?.frequency);
}

export function addFollowUpMetadata(workItem, holidayDates = [], timeZone = 'Asia/Kolkata') {
  const originalScheduledDate = getOriginalScheduledDate(workItem, timeZone);
  if (!isFollowUpEligible(workItem, holidayDates, timeZone)) {
    return { ...workItem, isFollowUp: false, originalScheduledDate };
  }
  const followUpDate = getNextWorkingDate(originalScheduledDate, holidayDates);
  const sourceDueAt = workItem.kind === 'checklist' ? (workItem.due_at || workItem.checklistItem?.due_at) : workItem.eta;
  const followUpDueAt = localDateTimeToIso(followUpDate, getTimeInTimeZone(sourceDueAt, timeZone), timeZone);
  return {
    ...workItem,
    isFollowUp: true,
    originalScheduledDate,
    followUpDate,
    followUpDueAt,
  };
}
