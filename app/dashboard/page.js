'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { EmptyState, MetricCard, PriorityBadge, StatusBadge } from '../../components/UI';
import { canCreateTasks, getCurrentEmployee } from '../../lib/auth';
import { formatChecklistDueAt, getChecklistDashboardData } from '../../lib/checklist-data';
import { formatTaskDeadline, getTaskDashboardData, getTaskEmployees } from '../../lib/task-data';
import { getTodaysWorkItems, getWorkItemStatus, toChecklistWorkItem, toTaskWorkItem } from '../../lib/work-data';

function MetricSkeleton() {
  return <div className="metric-card metric-card-loading" aria-hidden="true"><div className="metric-card-top"><span className="metric-icon skeleton-shimmer" /></div><div className="metric-value"><span className="metric-value-placeholder skeleton-shimmer" /></div><div className="metric-label"><span className="metric-label-placeholder skeleton-shimmer" /></div></div>;
}

function IntroSkeleton() {
  return <section className="overview-intro overview-intro-loading" aria-label="Loading dashboard"><p><span className="overview-greeting-placeholder skeleton-shimmer" /></p><span className="overview-subtitle-placeholder skeleton-shimmer" /></section>;
}

function getTaskDueDisplay(task) {
  if (task.kind === 'checklist') return { label: formatChecklistDueAt(task.due_at), overdue: getWorkItemStatus(task) === 'overdue' };
  return {
    label: formatTaskDeadline(task, { relative: true }),
    overdue: getWorkItemStatus(task) === 'overdue',
  };
}

function DashboardTaskRow({ task }) {
  const due = getTaskDueDisplay(task);
  const status = getWorkItemStatus(task);
  const href = task.kind === 'checklist' ? `/tasks/checklist/${task.id}` : `/tasks/${task.id}`;
  return <li className="dashboard-task-row">
    <div className="dashboard-task-primary">
      <Link href={href} className="dashboard-task-title">{task.title}</Link>
      <span className={task.kind === 'checklist' ? 'dashboard-task-category task-source-badge' : 'dashboard-task-category'}>{task.kind === 'checklist' ? 'Checklist' : task.category}</span>
    </div>
    <div className="dashboard-task-meta">
      <div className="dashboard-task-assignee"><span>Assigned to</span><strong>{task.assignee?.name || 'Unassigned'}</strong></div>
      <PriorityBadge priority={task.priority} />
      <StatusBadge status={status} compact />
      <span className={`dashboard-task-due${due.overdue ? ' overdue' : ''}`}>{due.label}</span>
    </div>
  </li>;
}

export default function Dashboard() {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    const { user, employee, error: employeeError } = await getCurrentEmployee();

    if (!user) {
      setLoading(false);
      return;
    }

    if (employeeError || !employee) {
      setError('Unable to load your workspace profile. Please try again.');
      setLoading(false);
      return;
    }

    const employeeRequest = canCreateTasks(employee.role)
      ? getTaskEmployees()
      : Promise.resolve({ data: [employee], error: null });
    const [taskResponse, checklistResponse, employeeResponse] = await Promise.all([
      getTaskDashboardData(),
      getChecklistDashboardData(),
      employeeRequest,
    ]);

    if (taskResponse.error) {
      setError(taskResponse.error.message || 'Unable to load dashboard data. Please try again.');
      setLoading(false);
      return;
    }

    const checklistItems = checklistResponse.data?.todayItems || [];
    if (checklistResponse.error) setError(checklistResponse.error.message || 'Checklist items could not be loaded.');
    if (employeeResponse.error) setError(employeeResponse.error.message || 'Employees could not be loaded.');
    const workItems = [
      ...(taskResponse.data?.todayTasks || []).map(toTaskWorkItem),
      ...checklistItems.map(toChecklistWorkItem),
    ];
    const now = new Date();
    const taskMetrics = taskResponse.data?.metrics || {};
    const checklistMetrics = checklistResponse.data?.metrics || {};

    setDashboardData({
      name: employee.name,
      role: employee.role,
      employees: employeeResponse.data || [],
      metrics: {
        total: (taskMetrics.total || 0) + (checklistMetrics.total || 0),
        pending: (taskMetrics.pending || 0) + (checklistMetrics.pending || 0),
        overdue: (taskMetrics.overdue || 0) + (checklistMetrics.overdue || 0),
        completed: (taskMetrics.completed || 0) + (checklistMetrics.completed || 0),
      },
      todayTasks: getTodaysWorkItems(workItems, now),
    });
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const manager = Boolean(dashboardData && ['super_admin', 'assigner', 'ea'].includes(dashboardData.role));
  const metrics = dashboardData?.metrics || {};
  const todayTasks = useMemo(() => dashboardData?.todayTasks || [], [dashboardData]);
  const employees = dashboardData?.employees || [];
  const [search, setSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredTodayTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return todayTasks.filter((task) => {
      const searchable = [task.title, task.description, task.assignee?.name, task.assignee?.email, task.category].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !query || searchable.includes(query);
      const matchesEmployee = employeeFilter === 'all' || task.assignee_id === employeeFilter;
      const taskStatus = getWorkItemStatus(task);
      return matchesSearch && matchesEmployee && (statusFilter === 'all' || taskStatus === statusFilter);
    });
  }, [employeeFilter, search, statusFilter, todayTasks]);

  const dashboardFiltersActive = Boolean(search.trim() || employeeFilter !== 'all' || statusFilter !== 'all');

  function clearDashboardFilters() {
    setSearch('');
    setEmployeeFilter('all');
    setStatusFilter('all');
  }

  const title = dashboardData ? (manager ? 'Dashboard' : 'My Tasks') : 'Loading workspace';
  const canCreate = dashboardData ? canCreateTasks(dashboardData.role) : false;

  return <AppShell title={title} eyebrow="Workspace" actions={canCreate ? <Link className="button button-primary" href="/tasks?create=1"><Icon name="plus" size={17} />Create task</Link> : null}>
    {!dashboardData ? <IntroSkeleton /> : <section className="overview-intro"><p>Good morning, <strong>{dashboardData.name}</strong></p><span>Here is what needs your attention.</span></section>}
    {error && <div className="inline-alert error" role="alert"><Icon name="warning" size={16} />{error}<button className="button button-ghost button-small" type="button" onClick={load}>Try again</button></div>}
    <section className="metric-grid overview-metrics" aria-label="Task summary">
    {!dashboardData ? <><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></> : <><MetricCard label="Total tasks" value={metrics.total} href="/tasks" /><MetricCard label="Pending" value={metrics.pending} tone="purple" href="/tasks?status=pending" /><MetricCard label="Overdue" value={metrics.overdue} tone={metrics.overdue ? 'orange' : 'green'} href="/tasks?status=overdue" /><MetricCard label="Completed" value={metrics.completed} tone="mint" href="/tasks?status=completed" /></>}
    </section>
    <section className="panel overview-panel">
      <div className="simple-section-heading"><div><h2>{dashboardData ? "Today's tasks" : 'Loading tasks'}</h2><p>{dashboardData ? 'All tasks scheduled for today are shown here.' : 'Loading your latest task summary.'}</p></div><Link className="text-link" href="/tasks">View all <Icon name="arrowUpRight" size={14} /></Link></div>
      <div className="filter-bar dashboard-task-filters">
        {manager && <label className="search-box"><Icon name="search" size={17} /><input aria-label="Search dashboard tasks or employees" placeholder="Search tasks or employees" value={search} onChange={(event) => setSearch(event.target.value)} disabled={!dashboardData} /></label>}
        {manager && <label className="filter-control"><span>Employee</span><select aria-label="Filter dashboard tasks by employee" value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)} disabled={!dashboardData}><option value="all">All employees</option>{employees.map((employeeOption) => <option value={employeeOption.id} key={employeeOption.id}>{employeeOption.name}</option>)}</select></label>}
        <label className="filter-control"><span>Status</span><select aria-label="Filter dashboard tasks by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} disabled={!dashboardData}><option value="all">All status</option><option value="pending">Pending</option><option value="overdue">Overdue</option><option value="completed">Completed</option></select></label>
        <button className="button button-ghost button-small filter-button" type="button" onClick={clearDashboardFilters} disabled={!dashboardData}><Icon name="filter" size={15} />Clear</button>
      </div>
      {!dashboardData ? <div className="overview-loading-list" aria-label="Loading tasks"><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /></div> : filteredTodayTasks.length ? <ul className="dashboard-task-list">{filteredTodayTasks.map((task) => <DashboardTaskRow key={`${task.kind}-${task.id}`} task={task} />)}</ul> : <EmptyState compact icon="checkCircle" title={dashboardFiltersActive ? 'No tasks match these filters.' : 'No tasks scheduled for today.'} description={dashboardFiltersActive ? 'Try a different search or clear the filters to see more work.' : 'Everything scheduled for today will appear here.'} action={dashboardFiltersActive ? 'Clear filters' : null} onAction={dashboardFiltersActive ? clearDashboardFilters : undefined} />}
    </section>
  </AppShell>;
}
