import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getPageCount, getWorkQueryError, isLatestRequest, normalizeWorkListRequest, WORK_PAGE_SIZE, WORK_QUERY_MIGRATION } from '../lib/work-list.mjs';

test('work list uses a bounded first page', () => {
  assert.deepEqual(normalizeWorkListRequest({}), {
    page: 0, pageSize: WORK_PAGE_SIZE, from: 0, to: 39, search: '', employeeId: null,
    workType: 'all', status: 'all', priority: 'all', dueDate: null, fromDate: null, toDate: null, includeCount: true,
  });
});

test('pagination ranges do not overlap', () => {
  const first = normalizeWorkListRequest({ page: 0 });
  const second = normalizeWorkListRequest({ page: 1 });
  assert.equal(first.to + 1, second.from);
  assert.equal(second.to - second.from + 1, WORK_PAGE_SIZE);
});

test('all task filters are normalized for the server query', () => {
  const request = normalizeWorkListRequest({
    search: '  payroll  ', employeeId: 'employee-1', workType: 'checklist', status: 'overdue',
    priority: 'high', dueDate: '2026-10-24', fromDate: '2026-10-01', toDate: '2026-10-31',
  });
  assert.deepEqual({ ...request, page: undefined, pageSize: undefined, from: undefined, to: undefined, includeCount: undefined }, {
    page: undefined, pageSize: undefined, from: undefined, to: undefined, includeCount: undefined,
    search: 'payroll', employeeId: 'employee-1', workType: 'checklist', status: 'overdue', priority: 'high',
    dueDate: '2026-10-24', fromDate: '2026-10-01', toDate: '2026-10-31',
  });
});

test('invalid filters cannot broaden into arbitrary database expressions', () => {
  const request = normalizeWorkListRequest({ workType: 'anything', status: 'broken', priority: 'urgent', dueDate: 'today' });
  assert.equal(request.workType, 'all');
  assert.equal(request.status, 'all');
  assert.equal(request.priority, 'all');
  assert.equal(request.dueDate, null);
});

test('page counts and stale request guards are deterministic', () => {
  assert.equal(getPageCount(81, 40), 3);
  assert.equal(getPageCount(0, 40), 1);
  assert.equal(isLatestRequest(4, 4), true);
  assert.equal(isLatestRequest(3, 4), false);
});

test('missing optimized query objects identify the required migration', () => {
  const relationError = getWorkQueryError({ code: 'PGRST205', message: "Could not find the table 'public.work_items' in the schema cache" });
  const functionError = getWorkQueryError({ code: 'PGRST202', message: "Could not find the function public.get_work_report" });
  assert.match(relationError.message, new RegExp(WORK_QUERY_MIGRATION));
  assert.match(functionError.message, new RegExp(WORK_QUERY_MIGRATION));
  const unrelatedError = new Error('Network request failed');
  assert.equal(getWorkQueryError(unrelatedError), unrelatedError);
});

test('task UI debounces search and cancels obsolete requests', async () => {
  const source = await readFile(new URL('../app/tasks/page.js', import.meta.url), 'utf8');
  assert.match(source, /setTimeout\([\s\S]*?, 300\)/);
  assert.match(source, /AbortController/);
  assert.match(source, /isLatestRequest/);
  assert.match(source, /Tasks could not be loaded/);
  assert.match(source, /task-loading-list/);
});

test('database read models preserve RLS and deterministic ordering', async () => {
  const [migration, dataSource] = await Promise.all([
    readFile(new URL('../supabase/migrations/20261024061358_optimize_work_list_queries.sql', import.meta.url), 'utf8'),
    readFile(new URL('../lib/work-data.js', import.meta.url), 'utf8'),
  ]);
  assert.match(migration, /security_invoker = true/);
  assert.match(migration, /grant select on public\.work_items to authenticated/);
  assert.match(migration, /create policy "tasks read"/);
  assert.match(dataSource, /order\('sort_group'/);
  assert.match(dataSource, /order\('sort_key'/);
  assert.match(dataSource, /order\('id'/);
});
