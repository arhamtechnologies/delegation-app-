import readXlsxFile from 'read-excel-file/node';

export const checklistImportMaxBytes = 5 * 1024 * 1024;
export const checklistImportHeaders = ['Doer Name', 'Doer Email', 'Task Details', 'Task Type', 'ETA'];
export const checklistWeekdayValues = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function clean(value) {
  return String(value ?? '').trim();
}

export function normalizeEmployeeName(value) {
  return clean(value).toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeEmployeeEmail(value) {
  return clean(value).toLowerCase();
}

export function normalizeChecklistTask(value) {
  return clean(value).toLowerCase().replace(/\s+/g, ' ');
}

function normalizeHeader(value) {
  return clean(value).toLowerCase().replace(/\s+/g, ' ');
}

function parseExcelTime(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && value >= 0 && value < 1) {
    const minutes = Math.round(value * 24 * 60);
    if (minutes >= 0 && minutes < 24 * 60) return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  const match = clean(value).match(/^(\d{1,2})(?:(?::|\.)(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  }
  return hour <= 23 && minute <= 59 ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : null;
}

export function parseChecklistRecurrence(value) {
  const normalized = clean(value).toLowerCase().replace(/\s+/g, ' ');
  if (normalized === 'daily') return { frequency: 'daily', weekday: null, dayOfMonth: null, monthlyDays: [] };
  if (normalized === 'every 15 days') return { frequency: 'every_15_days', weekday: null, dayOfMonth: null, monthlyDays: [] };

  const weekdayMatch = normalized.match(/^every (sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (weekdayMatch) return { frequency: 'weekly', weekday: checklistWeekdayValues[weekdayMatch[1]], dayOfMonth: null, monthlyDays: [] };

  if (normalized === 'monthly') return { frequency: 'monthly', weekday: null, dayOfMonth: 1, monthlyDays: [1] };
  if (normalized.includes('every month')) {
    const monthlyDays = [...new Set([...normalized.matchAll(/(\d{1,2})(?:st|nd|rd|th)?/g)].map((match) => Number(match[1])).filter((day) => day >= 1 && day <= 31))].sort((left, right) => left - right);
    if (monthlyDays.length) return { frequency: 'monthly', weekday: null, dayOfMonth: monthlyDays[0], monthlyDays };
  }
  return null;
}

export function buildChecklistTemplateKey(template) {
  const monthlyDays = (template.monthly_days || template.monthlyDays || (template.day_of_month ? [template.day_of_month] : [])).join(',');
  return [template.employee_id || template.employeeId, normalizeChecklistTask(template.task), template.frequency, template.weekday ?? '', template.day_of_month ?? template.dayOfMonth ?? '', monthlyDays, template.due_time || template.dueTime].join('|');
}

function findEmployee(name, email, employees) {
  const normalizedEmail = normalizeEmployeeEmail(email);
  const normalizedName = normalizeEmployeeName(name);
  if (normalizedEmail) {
    const emailMatch = employees.find((employee) => normalizeEmployeeEmail(employee.email) === normalizedEmail);
    if (emailMatch) return emailMatch;
  }
  const matches = employees.filter((employee) => normalizeEmployeeName(employee.name) === normalizedName);
  return matches.length === 1 ? matches[0] : null;
}

function summary(rows) {
  return {
    rowsDetected: rows.length,
    valid: rows.filter((row) => row.status === 'Ready').length,
    errors: rows.filter((row) => !['Ready', 'Duplicate'].includes(row.status)).length,
    duplicates: rows.filter((row) => row.status === 'Duplicate').length,
  };
}

export async function parseChecklistWorkbook(buffer, { filename = '', employees = [], existingTemplates = [], startDate } = {}) {
  const extension = clean(filename).toLowerCase().split('.').pop();
  if (extension !== 'xlsx') throw new Error('Only .xlsx files are supported.');
  if (!buffer?.length) throw new Error('The Excel file is empty.');

  let sheets;
  try {
    sheets = await readXlsxFile(buffer);
  } catch {
    throw new Error('The Excel file could not be opened. Check that it is a valid workbook.');
  }
  const firstSheet = sheets?.[0];
  const matrix = Array.isArray(firstSheet?.data) ? firstSheet.data : [];
  if (!matrix.length) throw new Error('The Excel workbook does not contain a worksheet.');
  const sheetName = firstSheet.sheet || 'First worksheet';
  const headerIndex = matrix.findIndex((row) => Array.isArray(row) && checklistImportHeaders.every((header) => row.some((value) => normalizeHeader(value) === normalizeHeader(header))));
  if (headerIndex < 0) throw new Error(`Invalid Excel format. Required columns: ${checklistImportHeaders.join(', ')}.`);
  const header = matrix[headerIndex].map(normalizeHeader);
  const columnIndex = Object.fromEntries(checklistImportHeaders.map((name) => [name, header.indexOf(normalizeHeader(name))]));
  const seenKeys = new Set();
  const existingKeys = new Set(existingTemplates.filter((template) => template.active !== false).map(buildChecklistTemplateKey));
  const rows = [];
  let context = { name: '', email: '' };

  matrix.slice(headerIndex + 1).forEach((row, index) => {
    if (!Array.isArray(row)) return;
    const rowNumber = headerIndex + index + 2;
    const values = checklistImportHeaders.map((name) => row[columnIndex[name]]);
    if (values.every((value) => clean(value) === '')) return;
    const [rawName, rawEmail, rawTask, rawType, rawEta] = values;
    if (clean(rawName)) context = { name: clean(rawName), email: clean(rawEmail) };
    else if (clean(rawEmail)) context.email = clean(rawEmail);
    const name = context.name;
    const email = context.email;
    const employee = findEmployee(name, email, employees);
    const recurrence = parseChecklistRecurrence(rawType);
    const dueTime = parseExcelTime(rawEta);
    const task = clean(rawTask);
    let status = 'Ready';
    let error = '';
    if (!name) { status = 'Employee not found'; error = 'No employee context was found for this row.'; }
    else if (!employee) { status = 'Employee not found'; error = email ? 'No existing employee matched this email.' : 'No existing employee matched this name.'; }
    else if (!task) { status = 'Missing task'; error = 'Task details are required.'; }
    else if (task.length > 240) { status = 'Invalid task'; error = 'Task details must be 240 characters or fewer.'; }
    else if (!recurrence) { status = 'Unsupported recurrence'; error = 'Task Type is not a supported recurrence.'; }
    else if (!dueTime) { status = 'Invalid time'; error = 'ETA must be a valid time from 00:00 through 23:59.'; }

    const rowData = { rowNumber, employee: employee?.name || name || '—', email: employee?.email || email || '—', employeeId: employee?.id || null, task, taskType: clean(rawType), frequency: recurrence?.frequency || null, weekday: recurrence?.weekday ?? null, dayOfMonth: recurrence?.dayOfMonth ?? null, monthlyDays: recurrence?.monthlyDays || [], dueTime, status, error, startDate };
    if (status === 'Ready') {
      const key = buildChecklistTemplateKey({ employee_id: employee.id, task, frequency: recurrence.frequency, weekday: recurrence.weekday, day_of_month: recurrence.dayOfMonth, monthly_days: recurrence.monthlyDays, due_time: dueTime });
      if (existingKeys.has(key) || seenKeys.has(key)) rowData.status = 'Duplicate';
      seenKeys.add(key);
      rowData.duplicateKey = key;
    }
    rows.push(rowData);
  });
  return { rows, summary: summary(rows), sheetName };
}

export function templateRowsForImport(rows, { allowDuplicates = false, createdBy, startDate } = {}) {
  return rows.filter((row) => row.status === 'Ready' || (allowDuplicates && row.status === 'Duplicate')).map((row) => ({
    employee_id: row.employeeId,
    task: row.task,
    frequency: row.frequency,
    weekday: row.frequency === 'weekly' ? row.weekday : null,
    day_of_month: row.frequency === 'monthly' ? row.dayOfMonth : null,
    monthly_days: row.frequency === 'monthly' ? row.monthlyDays : [],
    start_date: startDate,
    due_time: row.dueTime,
    active: true,
    created_by: createdBy,
  }));
}
