'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { EmptyState, MetricCard, PriorityBadge, ProgressBar, SectionHeader, StatusBadge } from '../../components/UI';
import { canCreateTasks, getCurrentEmployee } from '../../lib/auth';
import { formatChecklistDueAt, getChecklistTimeZone } from '../../lib/checklist-data';
import { getTaskAssignees } from '../../lib/task-data';
import { getWorkItemsPage, getWorkItemStatus, getWorkReport } from '../../lib/work-data';
import { getPageCount, WORK_PAGE_SIZE } from '../../lib/work-list.mjs';

const reportStatuses = [
  ['Pending', 'pending', 'blue'],
  ['Overdue', 'overdue', 'orange'],
  ['Completed', 'completed', 'mint'],
];

function formatReportDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: getChecklistTimeZone(), day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function getDueLabel(workItem) {
  if (workItem.isFollowUp) return `${formatDateOnly(workItem.originalScheduledDate)} → ${formatDateOnly(workItem.followUpDate)}`;
  return workItem.kind === 'checklist'
    ? formatChecklistDueAt(workItem.due_at, { timeZone: getChecklistTimeZone(), includeYear: true })
    : formatReportDateTime(workItem.eta);
}

function formatDateOnly(value) {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function getCompletedLabel(workItem) {
  return workItem.completed_at ? formatReportDateTime(workItem.completed_at) : '—';
}

function getWorkLink(workItem) {
  return workItem.kind === 'checklist' ? `/tasks/checklist/${workItem.id}` : `/tasks/${workItem.id}`;
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

export default function MIS() {
  const [employees, setEmployees] = useState([]);
  const [employeeRows, setEmployeeRows] = useState([]);
  const [counts, setCounts] = useState({ total: 0, pending: 0, overdue: 0, completed: 0, onTime: 0, tasks: 0, checklist: 0 });
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
  const [loading, setLoading] = useState(true);
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
    const [{ user, employee, error: employeeError }, { data: eligibleEmployees = [], error: employeeListError } = {}] = await Promise.all([
      getCurrentEmployee(),
      getTaskAssignees(),
    ]);
    if (!user) { setLoading(false); return; }
    if (employeeError || !employee) {
      setError('Unable to load your workspace profile. Please try again.');
      setLoading(false);
      return;
    }
    const manager = canCreateTasks(employee.role);
    const response = await getWorkReport({ workType, status, from, to, search: debouncedSearch, signal: controller.signal });
    if (controller.signal.aborted || reportRequestId.current !== requestId) return;
    if (employeeListError) setError(employeeListError.message || 'Employees could not be loaded.');
    else if (response.error) setError(response.error.message || 'The overall work report could not be loaded.');
    setEmployees(manager ? eligibleEmployees : [employee]);
    setEmployeeRows(response.data?.employees || []);
    setCounts(response.data?.summary || { total: 0, pending: 0, overdue: 0, completed: 0, onTime: 0, tasks: 0, checklist: 0 });
    setLoading(false);
  }, [debouncedSearch, from, status, to, workType]);

  useEffect(() => { load(); }, [load]);

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

  function handleEmployeeRowKeyDown(event, employeeId) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectEmployee(employeeId);
    }
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

  return <AppShell title="MIS reports" eyebrow="Manage / MIS reports" description="A clearer picture of overall work, delivery, and follow-through." actions={<><button className="button button-ghost button-small" type="button" onClick={() => window.print()}><Icon name="download" size={15} />Print report</button><button className="button button-primary" type="button" onClick={exportCsv} disabled={loading || detailLoading}><Icon name="download" size={16} />Export CSV</button></>}>
    <div className="mis-report">
      <div className="report-print-title">MIS REPORT</div>
      <div className="report-print-summary"><span>Period: {from || 'All dates'}{to ? ` to ${to}` : ''}</span><span>Employee: {employeeFilter === 'all' ? 'All employees' : employees.find((employee) => employee.id === employeeFilter)?.name || 'Selected employee'}</span><span>Status: {status === 'all' ? 'All status' : status}</span><span>Work type: {workType === 'all' ? 'All work' : workType === 'task' ? 'Tasks' : 'Checklist'}</span></div>
      <section className="metric-grid metric-grid-four" aria-label="Overall work summary"><MetricCard label="Total Work" value={reportCounts.total} change="Tasks + Checklist" tone="blue" icon="clipboard" /><MetricCard label="Pending" value={reportCounts.pending} change="Needs attention" tone="purple" icon="clock" /><MetricCard label="Overdue" value={reportCounts.overdue} change="Past due" tone="orange" icon="warning" /><MetricCard label="Completed" value={reportCounts.completed} change="Closed work" tone="mint" icon="checkCircle" /></section>
      {error && <div className="inline-alert error" role="alert"><Icon name="warning" size={16} />{error}<button className="button button-ghost button-small" type="button" onClick={load}>Try again</button></div>}
      <section className="panel report-panel"><SectionHeader eyebrow="Report controls" title="Filter the view" description="Review overall work by person, source, period, or workflow stage." /><div className="filter-bar report-filters"><label className="search-box"><Icon name="search" size={17} /><input aria-label="Search overall work report" placeholder="Search employees, tasks, or checklist work" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="filter-control"><span>Employee</span><select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}><option value="all">All employees</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></label><label className="filter-control"><span>Work type</span><select value={workType} onChange={(event) => setWorkType(event.target.value)}><option value="all">All work</option><option value="task">Tasks</option><option value="checklist">Checklist</option></select></label><label className="filter-control"><span>From</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="filter-control"><span>To</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><label className="filter-control"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All status</option><option value="pending">Pending</option><option value="overdue">Overdue</option><option value="completed">Completed</option></select></label><button className="button button-ghost button-small filter-button" type="button" onClick={clearFilters}><Icon name="filter" size={15} />Clear</button></div></section>
      <div className="report-layout"><section className="panel report-table-panel"><SectionHeader eyebrow="People performance" title="Employee-wise performance" description="Regular tasks and checklist occurrences combined by employee." /><div className="report-table-scroll">{loading ? <div className="loading-list"><span /><span /></div> : employeeRows.length ? <table className="report-table"><thead><tr><th>Employee</th><th>Total Work</th><th>Pending</th><th>Overdue</th><th>Completed</th><th>On-time</th></tr></thead><tbody>{employeeRows.map((row) => <tr className={`employee-performance-row${employeeFilter === row.employee_id ? ' is-selected' : ''}`} key={row.employee_id} onClick={() => selectEmployee(row.employee_id)} onKeyDown={(event) => handleEmployeeRowKeyDown(event, row.employee_id)} role="button" tabIndex={0}><td><strong>{row.employee_name}</strong></td><td>{row.total_work}</td><td>{row.pending_work}</td><td>{row.overdue_work}</td><td>{row.completed_work}</td><td><div className="table-progress"><span>{row.on_time_percent}%</span><ProgressBar value={row.on_time_percent} tone="mint" /></div></td></tr>)}</tbody></table> : <EmptyState compact icon="chart" title="No report data" description="Employee performance will appear after work is assigned." />}</div></section><div className="report-side-stack"><section className="panel breakdown-panel"><SectionHeader eyebrow="Overall work" title="Status breakdown" /><div className="breakdown-list">{reportStatuses.map(([label, key, tone]) => { const value = counts[key]; const percent = counts.total ? Math.round((value / counts.total) * 100) : 0; return <div className="breakdown-item" key={key}><div><span className={`breakdown-dot ${tone}`} />{label}<strong>{value}</strong></div><ProgressBar value={percent} tone={tone} /></div>; })}</div></section><section className="panel work-type-panel"><SectionHeader eyebrow="Source mix" title="Work type" /><div className="work-type-grid"><div><span>Tasks</span><strong>{counts.tasks}</strong></div><div><span>Checklist</span><strong>{counts.checklist}</strong></div><div><span>Total</span><strong>{counts.total}</strong></div></div></section><section className="panel overall-performance-panel"><SectionHeader eyebrow="Delivery health" title="Overall work performance" /><div className="overall-performance-list"><div><span>Total Work</span><strong>{counts.total}</strong></div><div><span>Pending</span><strong>{counts.pending}</strong></div><div><span>Overdue</span><strong>{counts.overdue}</strong></div><div><span>Completed</span><strong>{counts.completed}</strong></div><div><span>Completion Rate</span><strong>{completionRate}%</strong></div><div><span>On-time Rate</span><strong>{onTimeRate}%</strong></div></div></section></div></div>
      {employeeFilter !== 'all' && <section className="panel report-detail-panel"><SectionHeader eyebrow="Unified work detail" title={`Work detail — ${employees.find((employee) => employee.id === employeeFilter)?.name || 'Selected employee'}`} description="Every row is a regular task or one generated checklist occurrence." action={<div className="selected-employee-context"><button className="button button-ghost button-small" type="button" onClick={clearSelection}>Clear employee</button></div>} /><div className="report-table-scroll">{detailLoading ? <div className="loading-list"><span /><span /></div> : detailError ? <div className="inline-alert error" role="alert"><Icon name="warning" size={16} />{detailError}</div> : filteredDetailWorkItems.length ? <table className="report-table report-detail-table"><thead><tr><th>Type</th><th>Task</th><th>Priority</th><th>Status</th><th>Original / Follow-up</th><th>Completed</th></tr></thead><tbody>{filteredDetailWorkItems.map((workItem) => <tr key={`${workItem.kind}-${workItem.id}`}><td><span className={`report-type-badge ${workItem.kind === 'checklist' ? 'checklist' : 'task'}`}>{workItem.kind === 'checklist' ? 'Checklist' : 'Task'}</span></td><td><Link className="report-detail-link" href={getWorkLink(workItem)}>{workItem.title}</Link></td><td><PriorityBadge priority={workItem.priority} /></td><td><StatusBadge status={getWorkItemStatus(workItem)} compact /></td><td>{getDueLabel(workItem)}</td><td>{getCompletedLabel(workItem)}</td></tr>)}</tbody></table> : <EmptyState compact icon="clipboard" title="No work found for this employee" description="Try a different report filter to see matching work." />}</div></section>}
    </div>
  </AppShell>;
}
