export const WORK_PAGE_SIZE = 40;
export const WORK_QUERY_MIGRATION = '20261024061358_optimize_work_list_queries.sql';

const workQueryObjects = /\b(work_items|checklist_template_list|get_work_report)\b/i;
const missingDatabaseObject = /(42P01|42883|PGRST202|PGRST205|does not exist|schema cache|could not find)/i;

export function getWorkQueryError(error) {
  const databaseMessage = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
  if (workQueryObjects.test(databaseMessage) && missingDatabaseObject.test(databaseMessage)) {
    return new Error(`Database migration ${WORK_QUERY_MIGRATION} is not applied. Apply the migration in Supabase, then retry.`);
  }
  return error;
}

const allowedWorkTypes = new Set(['all', 'task', 'checklist']);
const allowedStatuses = new Set(['all', 'pending', 'overdue', 'completed']);
const allowedPriorities = new Set(['all', 'critical', 'high', 'normal']);

function normalizeChoice(value, allowed) {
  return allowed.has(value) ? value : 'all';
}

export function normalizeWorkListRequest(input = {}) {
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(input.pageSize, 10) || WORK_PAGE_SIZE));
  const page = Math.max(0, Number.parseInt(input.page, 10) || 0);
  return {
    page,
    pageSize,
    from: page * pageSize,
    to: (page + 1) * pageSize - 1,
    search: String(input.search || '').trim().slice(0, 120),
    employeeId: input.employeeId && input.employeeId !== 'all' ? String(input.employeeId) : null,
    workType: normalizeChoice(input.workType, allowedWorkTypes),
    status: normalizeChoice(input.status, allowedStatuses),
    priority: normalizeChoice(input.priority, allowedPriorities),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(input.dueDate || '')) ? String(input.dueDate) : null,
    fromDate: /^\d{4}-\d{2}-\d{2}$/.test(String(input.fromDate || '')) ? String(input.fromDate) : null,
    toDate: /^\d{4}-\d{2}-\d{2}$/.test(String(input.toDate || '')) ? String(input.toDate) : null,
    includeCount: input.includeCount !== false,
  };
}

export function getPageCount(total, pageSize = WORK_PAGE_SIZE) {
  return Math.max(1, Math.ceil(Math.max(0, Number(total) || 0) / pageSize));
}

export function isLatestRequest(requestId, latestRequestId) {
  return requestId === latestRequestId;
}
