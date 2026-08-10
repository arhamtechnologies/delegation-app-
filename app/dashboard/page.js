'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { EmptyState, MetricCard, PriorityBadge, StatusBadge, formatDate } from '../../components/UI';
import { canCreateTasks, getCurrentEmployee } from '../../lib/auth';
import { getTasks, taskIsDueSoon, taskIsOverdue, updateTaskStatus } from '../../lib/task-data';
import { supabaseBrowser } from '../../lib/supabase-browser';

function isToday(value) {
  if (!value) return false;
  return new Date(value).toDateString() === new Date().toDateString();
}

function MetricSkeleton() {
  return <div className="metric-card metric-card-loading" aria-hidden="true"><div className="metric-card-top"><span className="metric-icon skeleton-shimmer" /></div><div className="metric-value"><span className="metric-value-placeholder skeleton-shimmer" /></div><div className="metric-label"><span className="metric-label-placeholder skeleton-shimmer" /></div></div>;
}

function IntroSkeleton() {
  return <section className="overview-intro overview-intro-loading" aria-label="Loading dashboard"><p><span className="overview-greeting-placeholder skeleton-shimmer" /></p><span className="overview-subtitle-placeholder skeleton-shimmer" /></section>;
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
    const [taskResponse, employeeResponse] = await Promise.all([
      getTasks({ limit: 100 }),
      manager
        ? supabaseBrowser().from('employees').select('id', { count: 'exact', head: true }).eq('active', true)
        : Promise.resolve({ count: null, error: null }),
    ]);

    if (taskResponse.error || employeeResponse.error) {
      setError(taskResponse.error?.message || employeeResponse.error?.message || 'Unable to load dashboard data. Please try again.');
      setLoading(false);
      return;
    }

    setDashboardData({
      name: employee.name,
      role: employee.role,
      tasks: taskResponse.data || [],
      activeEmployees: manager ? employeeResponse.count || 0 : null,
    });
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const tasks = useMemo(() => dashboardData?.tasks || [], [dashboardData]);
  const manager = Boolean(dashboardData && ['super_admin', 'assigner', 'ea'].includes(dashboardData.role));
  const metrics = useMemo(() => ({
    total: tasks.length,
    open: tasks.filter((task) => !['closed', 'not_required'].includes(task.status)).length,
    overdue: tasks.filter(taskIsOverdue).length,
    dueSoon: tasks.filter(taskIsDueSoon).length,
    dueToday: tasks.filter((task) => isToday(task.eta) && !['closed', 'not_required'].includes(task.status)).length,
    completed: tasks.filter((task) => task.status === 'closed').length,
  }), [tasks]);

  const priorityTasks = useMemo(() => tasks.filter((task) => taskIsOverdue(task) || taskIsDueSoon(task)).slice(0, 8), [tasks]);

  async function changeStatus(id, status) {
    await updateTaskStatus(id, status);
    await load();
  }

  const title = dashboardData ? (manager ? 'Dashboard' : 'My Tasks') : 'Loading workspace';
  const canCreate = dashboardData ? canCreateTasks(dashboardData.role) : false;

  return <AppShell title={title} eyebrow="Workspace" actions={canCreate ? <Link className="button button-primary" href="/tasks?create=1"><Icon name="plus" size={17} />Create task</Link> : null}>
    {!dashboardData ? <IntroSkeleton /> : <section className="overview-intro"><p>Good morning, <strong>{dashboardData.name}</strong></p><span>Here is what needs your attention.</span></section>}
    {error && <div className="inline-alert error" role="alert"><Icon name="warning" size={16} />{error}<button className="button button-ghost button-small" type="button" onClick={load}>Try again</button></div>}
    <section className="metric-grid overview-metrics" aria-label="Task summary">
      {!dashboardData ? <><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></> : manager ? <><MetricCard label="Total tasks" value={metrics.total} href="/tasks" /><MetricCard label="Overdue" value={metrics.overdue} tone={metrics.overdue ? 'orange' : 'green'} href="/tasks?status=overdue" /><MetricCard label="Due soon" value={metrics.dueSoon} tone="purple" href="/tasks" /><MetricCard label="Active employees" value={dashboardData.activeEmployees} tone="mint" href="/employees" /></> : <><MetricCard label="My open tasks" value={metrics.open} href="/tasks" /><MetricCard label="Due today" value={metrics.dueToday} tone="purple" href="/tasks" /><MetricCard label="Overdue" value={metrics.overdue} tone={metrics.overdue ? 'orange' : 'green'} href="/tasks?status=overdue" /><MetricCard label="Completed" value={metrics.completed} tone="mint" href="/tasks?status=closed" /></>}
    </section>
    <section className="panel overview-panel">
      <div className="simple-section-heading"><div><h2>{dashboardData ? (manager ? 'Tasks needing attention' : 'My Tasks') : 'Loading tasks'}</h2><p>{dashboardData ? (manager ? 'Overdue and due-soon work appears here first.' : 'Your overdue and due-soon work appears here first.') : 'Loading your latest task summary.'}</p></div><Link className="text-link" href="/tasks">View all <Icon name="arrowUpRight" size={14} /></Link></div>
      {!dashboardData ? <div className="overview-loading-list" aria-label="Loading tasks"><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /></div> : priorityTasks.length ? <div className="simple-task-table">
        <div className="simple-table-heading"><span>Task</span><span>Assignee</span><span>Priority</span><span>Status</span><span>Due date</span><span /></div>
        {priorityTasks.map((task) => <div className="simple-task-row" key={task.id}><div><Link href={`/tasks/${task.id}`} className="task-title">{task.title}</Link><small>{task.category || 'General'}</small></div><span>{task.assignee?.name || 'Unassigned'}</span><PriorityBadge priority={task.priority} /><StatusBadge status={task.status} compact /><span className={taskIsOverdue(task) ? 'due-date overdue' : 'due-date'}>{formatDate(task.eta, { month: 'short', day: 'numeric' })}</span><div className="simple-row-action"><select className="status-select" aria-label={`Change status for ${task.title}`} value={task.status} onChange={(event) => changeStatus(task.id, event.target.value)}><option value="pending">To do</option><option value="followup">In progress</option><option value="submitted">In review</option><option value="closed">Completed</option><option value="not_required">Not required</option></select></div></div>)}
      </div> : <EmptyState compact icon="checkCircle" title="No priority tasks" description="You are all caught up. New urgent work will appear here." />}
    </section>
  </AppShell>;
}
