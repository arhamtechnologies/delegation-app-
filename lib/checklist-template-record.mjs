// Validation shared by the checklist template API and the WhatsApp bot.
export const templateFrequencies = ['daily', 'weekly', 'every_15_days', 'monthly'];
const frequencyValues = new Set(templateFrequencies);

function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value); }
function validTime(value) { return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
function cleanDays(value) { return [...new Set((Array.isArray(value) ? value : []).map(Number))].sort((left, right) => left - right); }

export function normalizeTemplateRecord(payload, createdBy) {
  const frequency = payload?.frequency;
  const monthlyDays = cleanDays(payload?.monthly_days);
  if (!payload?.employee_id || !payload?.task?.trim() || payload.task.trim().length > 240) throw new Error('Choose an employee and provide a task between 1 and 240 characters.');
  if (!frequencyValues.has(frequency)) throw new Error('Choose a supported recurrence.');
  if (!validDate(payload.start_date)) throw new Error('Start date must be a valid date.');
  if (!validTime(payload.due_time)) throw new Error('Due time must be between 00:00 and 23:59.');
  if (frequency === 'weekly' && (!Number.isInteger(Number(payload.weekday)) || Number(payload.weekday) < 0 || Number(payload.weekday) > 6)) throw new Error('Choose a weekday for weekly recurrence.');
  if (frequency === 'monthly' && (!monthlyDays.length || monthlyDays.some((day) => day < 1 || day > 31))) throw new Error('Choose one or more valid monthly days.');
  const record = {
    employee_id: payload.employee_id,
    task: payload.task.trim(),
    frequency,
    weekday: frequency === 'weekly' ? Number(payload.weekday) : null,
    day_of_month: frequency === 'monthly' ? monthlyDays[0] : null,
    monthly_days: frequency === 'monthly' ? monthlyDays : [],
    start_date: payload.start_date,
    due_time: payload.due_time,
    active: payload.active !== false,
  };
  if (createdBy) record.created_by = createdBy;
  return record;
}
