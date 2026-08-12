'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { EmptyState, MetricCard, PriorityBadge, StatusBadge } from '../../components/UI';
import { canCreateTasks, getCurrentEmployee } from '../../lib/auth';
import { formatChecklistDueAt, getBusinessDate, getChecklistItems, getChecklistStatus } from '../../lib/checklist-data';
import { formatTaskDeadline, getDashboardData, getTaskStatus } from '../../lib/task-data';
import { supabaseBrowser } from '../../lib/supabase-browser';

function MetricSkeleton() {
  return <div className="metric-card metric-card-loading" aria-hidden="true"><div className="metric-card-top"><span className="metric-icon skeleton-shimmer" /></div><div className="metric-value"><span className="metric-value-placeholder skeleton-shimmer" /></div><div className="metric-label"><span className="metric-label-placeholder skeleton-shimmer" /></div></div>;
}

function IntroSkeleton() {
  return <section className="overview-intro overview-intro-loading" aria-label="Loading dashboard"><p><span className="overview-greeting-placeholder skeleton-shimmer" /></p><span className="overview-subtitle-placeholder skeleton-shimmer" /></section>;
}

function getTaskDueDisplay(task) {
  if (task.kind === 'checklist') return { label: formatChecklistDueAt(task.due_at), overdue: getChecklistStatus(task) === 'overdue' };
  return {
    label: formatTaskDeadline(task, { relative: true }),
    overdue: getTaskStatus(task) === 'overdue',
  };
}

function DashboardTaskRow({ task }) {
  const due = getTaskDueDisplay(task);
  const status = task.kind === 'checklist' ? getChecklistStatus(task) : getTaskStatus(task);
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

    const manager = ['super_admin', 'assigner', 'ea'].includes(employee.role);
    const [dashboardResponse, employeeResponse, checklistResponse] = await Promise.all([
      getDashboardData(manager),
      manager
        ? supabaseBrowser().from('employees').select('id', { count: 'exact', head: true }).eq('active', true)
        : Promise.resolve({ count: null, error: null }),
      getChecklistItems({ limit: 500 }),
    ]);

    if (dashboardResponse.error || employeeResponse.error) {
      setError(dashboardResponse.error?.message || employeeResponse.error?.message || 'Unable to load dashboard data. Please try again.');
      setLoading(false);
      return;
    }

    const checklistItems = checklistResponse.data || [];
    if (checklistResponse.error) setError(checklistResponse.error.message || 'Checklist items could not be loaded.');
    const checklistWorkItems = checklistItems.map((item) => ({ ...item, kind: 'checklist', title: item.task, priority: 'normal', category: 'Checklist', assignee: item.employee }));
    const checklistStatuses = checklistItems.map((item) => getChecklistStatus(item));
    const checklistMetrics = {
      total: checklistItems.length,
      overdue: checklistStatuses.filter((status) => status === 'overdue').length,
      pending: checklistStatuses.filter((status) => status === 'pending').length,
      completed: checklistStatuses.filter((status) => status === 'completed').length,
      dueToday: checklistItems.filter((item) => item.due_date === getBusinessDate()).length,
      dueSoon: checklistItems.filter((item) => {
        const dueAt = new Date(item.due_at).getTime();
        return getChecklistStatus(item) === 'pending' && Number.isFinite(dueAt) && dueAt <= Date.now() + 48 * 60 * 60 * 1000;
      }).length,
    };
    const normalMetrics = dashboardResponse.data.metrics;
    const metrics = manager
      ? { ...normalMetrics, total: normalMetrics.total + checklistMetrics.total, overdue: normalMetrics.overdue + checklistMetrics.overdue, dueSoon: normalMetrics.dueSoon + checklistMetrics.dueSoon }
      : { ...normalMetrics, open: normalMetrics.open + checklistMetrics.pending + checklistMetrics.overdue, dueToday: normalMetrics.dueToday + checklistMetrics.dueToday, overdue: normalMetrics.overdue + checklistMetrics.overdue, completed: normalMetrics.completed + checklistMetrics.completed };
    const priorityTasks = [...dashboardResponse.data.priorityTasks, ...checklistWorkItems]
      .sort((left, right) => new Date(left.eta || left.due_at || 0) - new Date(right.eta || right.due_at || 0))
      .slice(0, 8);

    setDashboardData({
      name: employee.name,
      role: employee.role,
      metrics,
      priorityTasks,
      activeEmployees: manager ? employeeResponse.count || 0 : null,
    });
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const manager = Boolean(dashboardData && ['super_admin', 'assigner', 'ea'].includes(dashboardData.role));
  const metrics = dashboardData?.metrics || {};
  const priorityTasks = dashboardData?.priorityTasks || [];

  const title = dashboardData ? (manager ? 'Dashboard' : 'My Tasks') : 'Loading workspace';
  const canCreate = dashboardData ? canCreateTasks(dashboardData.role) : false;

  return <AppShell title={title} eyebrow="Workspace" actions={canCreate ? <Link className="button button-primary" href="/tasks?create=1"><Icon name="plus" size={17} />Create task</Link> : null}>
    {!dashboardData ? <IntroSkeleton /> : <section className="overview-intro"><p>Good morning, <strong>{dashboardData.name}</strong></p><span>Here is what needs your attention.</span></section>}
    {error && <div className="inline-alert error" role="alert"><Icon name="warning" size={16} />{error}<button className="button button-ghost button-small" type="button" onClick={load}>Try again</button></div>}
    <section className="metric-grid overview-metrics" aria-label="Task summary">
    {!dashboardData ? <><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></> : manager ? <><MetricCard label="Total tasks" value={metrics.total} href="/tasks" /><MetricCard label="Overdue" value={metrics.overdue} tone={metrics.overdue ? 'orange' : 'green'} href="/tasks?status=overdue" /><MetricCard label="Due soon" value={metrics.dueSoon} tone="purple" href="/tasks" /><MetricCard label="Active employees" value={dashboardData.activeEmployees} tone="mint" href="/employees" /></> : <><MetricCard label="My open tasks" value={metrics.open} href="/tasks" /><MetricCard label="Due today" value={metrics.dueToday} tone="purple" href="/tasks" /><MetricCard label="Overdue" value={metrics.overdue} tone={metrics.overdue ? 'orange' : 'green'} href="/tasks?status=overdue" /><MetricCard label="Completed" value={metrics.completed} tone="mint" href="/tasks?status=completed" /></>}
    </section>
    <section className="panel overview-panel">
      <div className="simple-section-heading"><div><h2>{dashboardData ? (manager ? 'Tasks needing attention' : 'My Tasks') : 'Loading tasks'}</h2><p>{dashboardData ? (manager ? 'Overdue and due-soon work appears here first.' : 'Your overdue and due-soon work appears here first.') : 'Loading your latest task summary.'}</p></div><Link className="text-link" href="/tasks">View all <Icon name="arrowUpRight" size={14} /></Link></div>
      {!dashboardData ? <div className="overview-loading-list" aria-label="Loading tasks"><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /></div> : priorityTasks.length ? <ul className="dashboard-task-list">{priorityTasks.map((task) => <DashboardTaskRow key={task.id} task={task} />)}</ul> : <EmptyState compact icon="checkCircle" title="No priority tasks" description="You are all caught up. New urgent work will appear here." />}
    </section>
  </AppShell>;
}
