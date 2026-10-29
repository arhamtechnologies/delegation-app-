'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { ClearFiltersButton, FilterDate, FilterSelect, InlineError, ListEmpty, ListSkeleton, StatStrip, StatusIcon, Surface, SurfaceHeader, Toolbar, ToolbarSearch } from '../../components/Workflow';
import { WorkColumnsHeader, WorkItemRow } from '../../components/WorkList';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getCurrentEmployee } from '../../lib/auth';
import { getChecklistTimeZone } from '../../lib/checklist-data';
import { isFreshRender, loadMisData } from '../../lib/page-data';
import { getWorkItemsPage, getWorkItemStatus } from '../../lib/work-data';
import { getPageCount, WORK_PAGE_SIZE } from '../../lib/work-list.mjs';

const reportStatuses = [
  ['Pending', 'pending', 'bg-[#9aa0ad]'],
  ['Overdue', 'overdue', 'bg-destructive'],
  ['Completed', 'completed', 'bg-brand'],
];

function formatReportDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: getChecklistTimeZone(), day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function getCompletedLabel(workItem) {
  return workItem.completed_at ? formatReportDateTime(workItem.completed_at) : '—';
}

function escapeCsv(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function csvDateAndTime(value) {
  if (!value) return ['', ''];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return ['', ''];
  const options = { timeZone: getChecklistTimeZone() };
  return [
    new Intl.DateTimeFormat('en-CA', { ...options, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date),
    new Intl.DateTimeFormat('en-GB', { ...options, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date),
  ];
}

export default function MisView({ initialData }) {
  const [employees, setEmployees] = useState(initialData?.employees || []);
  const [employeeRows, setEmployeeRows] = useState(initialData?.employeeRows || []);
  const [counts, setCounts] = useState(initialData?.counts || { total: 0, pending: 0, overdue: 0, completed: 0, onTime: 0, tasks: 0, checklist: 0 });
  const skipFirstLoadRef = useRef(Boolean(initialData));
  const [detailWorkItems, setDetailWorkItems] = useState([]);
  const [detailPage, setDetailPage] = useState(0);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const detailRequestId = useRef(0);
  const reportRequestId = useRef(0);
  const reportAbortRef = useRef(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [workType, setWorkType] = useState('all');
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    reportAbortRef.current?.abort();
    const controller = new AbortController();
    reportAbortRef.current = controller;
    const requestId = reportRequestId.current + 1;
    reportRequestId.current = requestId;
    setLoading(true);
    setError('');
    try {
      const { user, employee, error: employeeError } = await getCurrentEmployee();
      if (controller.signal.aborted || reportRequestId.current !== requestId) return;
      if (!user) return;
      if (employeeError || !employee) throw employeeError || new Error('Unable to load your workspace profile. Please try again.');
      // People list and report run together; the profile is usually cached already.
      const response = await loadMisData({ employee, filters: { workType, status, from, to, search: debouncedSearch }, signal: controller.signal });
      if (controller.signal.aborted || reportRequestId.current !== requestId) return;
      if (response.error) throw response.error;
      if (!response.data?.counts || !Array.isArray(response.data.employeeRows)) {
        throw new Error('The overall work report returned an incomplete response. Please try again.');
      }
      setEmployees(response.data.employees);
      setEmployeeRows(response.data.employeeRows);
      setCounts(response.data.counts);
    } catch (loadError) {
      if (!controller.signal.aborted && reportRequestId.current === requestId) {
        console.error('[mis] report load failed', { message: loadError.message || 'Unknown report loading error' });
        setError(loadError.message || 'The overall work report could not be loaded.');
      }
    } finally {
      if (!controller.signal.aborted && reportRequestId.current === requestId) setLoading(false);
    }
  }, [debouncedSearch, from, status, to, workType]);

  useEffect(() => {
    if (skipFirstLoadRef.current) { skipFirstLoadRef.current = false; setLoading(false); if (isFreshRender(initialData)) return; }
    load();
  }, [initialData, load]);

  useEffect(() => {
    const requestId = detailRequestId.current + 1;
    detailRequestId.current = requestId;
    if (employeeFilter === 'all') {
      setDetailWorkItems([]);
      setDetailError('');
      setDetailLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    async function loadEmployeeDetail() {
      setDetailLoading(true);
      setDetailError('');
      const response = await getWorkItemsPage({
        page: detailPage,
        pageSize: WORK_PAGE_SIZE,
        employeeId: employeeFilter,
        status,
        workType,
        fromDate: from,
        toDate: to,
        search: debouncedSearch,
        includeCount: detailPage === 0,
        signal: controller.signal,
      });
      if (controller.signal.aborted || detailRequestId.current !== requestId) return;
      if (response.error) setDetailError(response.error.message || 'This employee\'s work could not be loaded.');
      setDetailWorkItems(response.data || []);
      if (response.count !== null && response.count !== undefined) setDetailTotal(response.count);
      setDetailLoading(false);
    }

    loadEmployeeDetail();
    return () => controller.abort();
  }, [debouncedSearch, detailPage, employeeFilter, from, status, to, workType]);

  useEffect(() => { setDetailPage(0); }, [debouncedSearch, employeeFilter, from, status, to, workType]);
  useEffect(() => () => reportAbortRef.current?.abort(), []);

  const filteredDetailWorkItems = detailWorkItems;
  const detailPageCount = getPageCount(detailTotal, WORK_PAGE_SIZE);
  const selectedEmployeeRow = employeeFilter === 'all' ? null : employeeRows.find((row) => row.employee_id === employeeFilter);
  const reportCounts = selectedEmployeeRow ? {
    total: selectedEmployeeRow.total_work,
    pending: selectedEmployeeRow.pending_work,
    overdue: selectedEmployeeRow.overdue_work,
    completed: selectedEmployeeRow.completed_work,
    onTime: selectedEmployeeRow.on_time_work,
    tasks: selectedEmployeeRow.tasks_work,
    checklist: selectedEmployeeRow.checklist_work,
  } : counts;
  const completionRate = reportCounts.total ? Math.round((reportCounts.completed / reportCounts.total) * 100) : 0;
  const onTimeRate = reportCounts.completed ? Math.round((reportCounts.onTime / reportCounts.completed) * 100) : 0;

  function clearFilters() {
    setSearch('');
    setEmployeeFilter('all');
    setWorkType('all');
    setFrom('');
    setTo('');
    setStatus('all');
  }

  function selectEmployee(employeeId) {
    setDetailPage(0);
    setEmployeeFilter(employeeId);
  }

  function clearSelection() {
    setDetailPage(0);
    setEmployeeFilter('all');
  }

  function exportCsv() {
    const header = employeeFilter === 'all'
      ? ['Employee', 'Total Work', 'Pending', 'Overdue', 'Completed', 'On-time %']
      : ['Type', 'Employee ID', 'Employee', 'Email', 'Task', 'Priority', 'Status', 'Original Scheduled Date', 'Follow-up Date', 'Due Date', 'Due Time', 'Completed Date', 'Completed Time'];
    const values = employeeFilter === 'all'
      ? employeeRows.map((row) => [row.employee_name, row.total_work, row.pending_work, row.overdue_work, row.completed_work, `${row.on_time_percent}%`])
      : filteredDetailWorkItems.map((workItem) => {
        const [dueDate, dueTime] = csvDateAndTime(workItem.kind === 'checklist' ? workItem.due_at : workItem.eta);
        const [completedDate, completedTime] = csvDateAndTime(workItem.completed_at);
        return [
          workItem.kind === 'checklist' ? 'Checklist' : 'Task',
          workItem.employeeId || workItem.assignee_id || '',
          workItem.employeeName || workItem.assignee?.name || '',
          workItem.employeeEmail || workItem.assignee?.email || '',
          workItem.title || '',
          workItem.priority || 'normal',
          getWorkItemStatus(workItem),
          workItem.originalScheduledDate || '',
          workItem.followUpDate || '',
          dueDate,
          dueTime,
          completedDate,
          completedTime,
        ];
      });
    const csv = [header, ...values].map((line) => line.map(escapeCsv).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'delegation-overall-work-mis.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const filtersActive = Boolean(search || employeeFilter !== 'all' || workType !== 'all' || from || to || status !== 'all');
  const selectedName = employees.find((employee) => employee.id === employeeFilter)?.name || 'Selected employee';
  return <AppShell title="MIS reports" description="Overall work, delivery and follow-through across the team." actions={<><Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => window.print()}><Icon name="download" size={15} />Print</Button><Button size="sm" className="h-8 gap-1.5" onClick={exportCsv} disabled={loading || detailLoading}><Icon name="download" size={15} />Export CSV</Button></>}>
    <div className="report-print-title">MIS REPORT</div>
    <div className="report-print-summary"><span>Period: {from || 'All dates'}{to ? ` to ${to}` : ''}</span><span>Employee: {employeeFilter === 'all' ? 'All employees' : selectedName}</span><span>Status: {status === 'all' ? 'All status' : status}</span><span>Work type: {workType === 'all' ? 'All work' : workType === 'task' ? 'Tasks' : 'Checklist'}</span></div>
    <Surface>
      <Toolbar search={<ToolbarSearch value={search} onChange={setSearch} placeholder="Search people, tasks, or checklist work" label="Search overall work report" />}>
        <FilterSelect label="Person" value={employeeFilter} onChange={(value) => { setDetailPage(0); setEmployeeFilter(value); }}><option value="all">Everyone</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</FilterSelect>
        <FilterSelect label="Type" value={workType} onChange={setWorkType}><option value="all">All work</option><option value="task">Tasks</option><option value="checklist">Checklist</option></FilterSelect>
        <FilterSelect label="Status" value={status} onChange={setStatus}><option value="all">Any</option><option value="pending">Pending</option><option value="overdue">Overdue</option><option value="completed">Completed</option></FilterSelect>
        <FilterDate label="From" value={from} onChange={setFrom} />
        <FilterDate label="To" value={to} onChange={setTo} />
        <ClearFiltersButton visible={filtersActive} onClick={clearFilters} />
      </Toolbar>
      <InlineError message={error} onRetry={load} />
    </Surface>
    <StatStrip items={[
      { label: employeeFilter === 'all' ? 'Total work' : `${selectedName.split(' ')[0]}'s work`, value: reportCounts.total, icon: 'clipboard', hint: `${reportCounts.tasks || 0} tasks · ${reportCounts.checklist || 0} checklist` },
      { label: 'Pending', value: reportCounts.pending, status: 'pending' },
      { label: 'Overdue', value: reportCounts.overdue, status: 'overdue', tone: 'danger' },
      { label: 'Completed', value: reportCounts.completed, status: 'completed', hint: `${completionRate}% done · ${onTimeRate}% on time` },
    ]} />
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Surface>
        <SurfaceHeader title="People" description="Select a person to see their work below." />
        {loading ? <ListSkeleton rows={5} /> : employeeRows.length ? <>
          <div className="hidden h-9 grid-cols-[minmax(0,1fr)_repeat(4,64px)_120px] items-center gap-2 border-b border-border bg-muted/50 px-4 text-[13px] font-medium text-muted-foreground sm:grid"><span>Person</span><span className="text-right">Total</span><span className="text-right">Pending</span><span className="text-right">Overdue</span><span className="text-right">Done</span><span className="text-right">On time</span></div>
          <ul className="divide-y divide-border/70">{employeeRows.map((row) => {
            const selected = employeeFilter === row.employee_id;
            return <li key={row.employee_id}>
              <button type="button" aria-pressed={selected} onClick={() => (selected ? clearSelection() : selectEmployee(row.employee_id))} className={cn('grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left text-[14.5px] transition-colors hover:bg-muted/50 sm:grid-cols-[minmax(0,1fr)_repeat(4,64px)_120px] sm:gap-2 sm:px-4', selected && 'bg-brand-soft/60 hover:bg-brand-soft')}>
                <span className={cn('truncate font-medium', selected ? 'text-brand-dark' : 'text-foreground')}>{row.employee_name}</span>
                <span className="text-right tabular-nums sm:text-foreground"><span className="text-muted-foreground sm:hidden">Total </span>{row.total_work}</span>
                <span className="col-span-2 flex gap-3 text-[13.5px] text-muted-foreground tabular-nums sm:hidden"><span>{row.pending_work} pending</span><span className={row.overdue_work ? 'text-destructive' : ''}>{row.overdue_work} overdue</span><span>{row.completed_work} done</span><span className="ml-auto">{row.on_time_percent}% on time</span></span>
                <span className="hidden text-right text-muted-foreground tabular-nums sm:block">{row.pending_work}</span>
                <span className={cn('hidden text-right tabular-nums sm:block', row.overdue_work ? 'font-medium text-destructive' : 'text-muted-foreground')}>{row.overdue_work}</span>
                <span className="hidden text-right text-muted-foreground tabular-nums sm:block">{row.completed_work}</span>
                <span className="hidden items-center justify-end gap-2 sm:flex"><span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, row.on_time_percent)}%` }} /></span><span className="w-9 text-right text-muted-foreground tabular-nums">{row.on_time_percent}%</span></span>
              </button>
            </li>;
          })}</ul>
        </> : <ListEmpty icon="chart" title="No report data" description="Performance appears once work is assigned." />}
      </Surface>
      <div className="grid content-start gap-4">
        <Surface className="p-4">
          <h2 className="mb-3 text-[14px] font-semibold text-foreground">Status breakdown</h2>
          <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-muted">{reportStatuses.map(([label, key, color]) => <span key={key} className={color} style={{ width: `${reportCounts.total ? (reportCounts[key] / reportCounts.total) * 100 : 0}%` }} title={label} />)}</div>
          <div className="grid gap-2">{reportStatuses.map(([label, key]) => <div key={key} className="flex items-center gap-2 text-[14px]"><StatusIcon status={key} size={14} /><span className="text-muted-foreground">{label}</span><span className="ml-auto font-medium tabular-nums">{reportCounts[key]}</span><span className="w-10 text-right text-muted-foreground tabular-nums">{reportCounts.total ? Math.round((reportCounts[key] / reportCounts.total) * 100) : 0}%</span></div>)}</div>
        </Surface>
        <Surface className="p-4">
          <h2 className="mb-3 text-[14px] font-semibold text-foreground">Delivery health</h2>
          <dl className="grid gap-2 text-[14px]">
            <div className="flex justify-between"><dt className="text-muted-foreground">Completion rate</dt><dd className="font-medium tabular-nums">{completionRate}%</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">On-time rate</dt><dd className="font-medium tabular-nums">{onTimeRate}%</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Tasks</dt><dd className="font-medium tabular-nums">{reportCounts.tasks || 0}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Checklist items</dt><dd className="font-medium tabular-nums">{reportCounts.checklist || 0}</dd></div>
          </dl>
        </Surface>
      </div>
    </div>
    {employeeFilter !== 'all' && <Surface className="report-detail-panel">
      <SurfaceHeader title={`${selectedName}'s work`} description="Every regular task and generated checklist occurrence in this view." actions={<Button variant="ghost" size="sm" className="h-8" onClick={clearSelection}><Icon name="close" size={14} />Clear person</Button>} />
      {detailLoading ? <ListSkeleton rows={4} /> : detailError ? <InlineError message={detailError} /> : filteredDetailWorkItems.length ? <><WorkColumnsHeader showPerson={false} extraLabel="Completed" /><ul className="divide-y divide-border/70">{filteredDetailWorkItems.map((workItem) => <WorkItemRow key={`${workItem.kind}-${workItem.id}`} workItem={workItem} showAssignee={false} extra={getWorkItemStatus(workItem) === 'completed' ? getCompletedLabel(workItem) : ''} />)}</ul></> : <ListEmpty icon="clipboard" title="No work found for this person" description="Try a different report filter to see matching work." />}
      {detailPageCount > 1 && <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-[14px] text-muted-foreground"><span className="tabular-nums">Page {detailPage + 1} of {detailPageCount}</span><div className="flex gap-1.5"><Button variant="outline" size="sm" className="h-8" onClick={() => setDetailPage((value) => Math.max(0, value - 1))} disabled={detailPage === 0}>Previous</Button><Button variant="outline" size="sm" className="h-8" onClick={() => setDetailPage((value) => Math.min(detailPageCount - 1, value + 1))} disabled={detailPage + 1 >= detailPageCount}>Next</Button></div></div>}
    </Surface>}
  </AppShell>;
}
