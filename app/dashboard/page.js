'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { EmptyState, MetricCard, PriorityBadge, formatDate } from '../../components/UI';
import { canCreateTasks, getCurrentEmployee } from '../../lib/auth';
import { getDashboardData, taskIsOverdue, updateTaskStatus } from '../../lib/task-data';
import { supabaseBrowser } from '../../lib/supabase-browser';

function MetricSkeleton() {
  return <div className="metric-card metric-card-loading" aria-hidden="true"><div className="metric-card-top"><span className="metric-icon skeleton-shimmer" /></div><div className="metric-value"><span className="metric-value-placeholder skeleton-shimmer" /></div><div className="metric-label"><span className="metric-label-placeholder skeleton-shimmer" /></div></div>;
}

function IntroSkeleton() {
  return <section className="overview-intro overview-intro-loading" aria-label="Loading dashboard"><p><span className="overview-greeting-placeholder skeleton-shimmer" /></p><span className="overview-subtitle-placeholder skeleton-shimmer" /></section>;
}

function getTaskDueDisplay(task) {
  if (!task.eta) return { label: 'No due date', overdue: false };
  const dueDate = new Date(task.eta);
  if (Number.isNaN(dueDate.getTime())) return { label: 'No due date', overdue: false };
  const today = new Date();
  const isToday = dueDate.getFullYear() === today.getFullYear()
    && dueDate.getMonth() === today.getMonth()
    && dueDate.getDate() === today.getDate();
  return {
    label: isToday ? 'Due today' : `Due ${formatDate(task.eta, { month: 'short', day: 'numeric' })}`,
    overdue: taskIsOverdue(task),
  };
}

function DashboardTaskRow({ task, onStatusChange }) {
  const due = getTaskDueDisplay(task);
  return <li className="dashboard-task-row">
    <div className="dashboard-task-primary">
      <Link href={`/tasks/${task.id}`} className="dashboard-task-title">{task.title}</Link>
      {task.category && <span className="dashboard-task-category">{task.category}</span>}
    </div>
    <div className="dashboard-task-meta">
      <div className="dashboard-task-assignee"><span>Assigned to</span><strong>{task.assignee?.name || 'Unassigned'}</strong></div>
      <PriorityBadge priority={task.priority} />
      <select className={`dashboard-task-status-select dashboard-task-status-${task.status}`} aria-label={`Change status for ${task.title}`} value={task.status} onChange={(event) => onStatusChange(task.id, event.target.value)}>
        <option value="pending">To do</option>
        <option value="followup">In progress</option>
        <option value="submitted">In review</option>
        <option value="closed">Completed</option>
        <option value="not_required">Not required</option>
      </select>
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
    const [dashboardResponse, employeeResponse] = await Promise.all([
      getDashboardData(manager),
      manager
        ? supabaseBrowser().from('employees').select('id', { count: 'exact', head: true }).eq('active', true)
        : Promise.resolve({ count: null, error: null }),
    ]);

    if (dashboardResponse.error || employeeResponse.error) {
      setError(dashboardResponse.error?.message || employeeResponse.error?.message || 'Unable to load dashboard data. Please try again.');
      setLoading(false);
      return;
    }

    setDashboardData({
      name: employee.name,
      role: employee.role,
      metrics: dashboardResponse.data.metrics,
      priorityTasks: dashboardResponse.data.priorityTasks,
      activeEmployees: manager ? employeeResponse.count || 0 : null,
    });
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const manager = Boolean(dashboardData && ['super_admin', 'assigner', 'ea'].includes(dashboardData.role));
  const metrics = dashboardData?.metrics || {};
  const priorityTasks = dashboardData?.priorityTasks || [];

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
      {!dashboardData ? <div className="overview-loading-list" aria-label="Loading tasks"><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /></div> : priorityTasks.length ? <ul className="dashboard-task-list">{priorityTasks.map((task) => <DashboardTaskRow key={task.id} task={task} onStatusChange={changeStatus} />)}</ul> : <EmptyState compact icon="checkCircle" title="No priority tasks" description="You are all caught up. New urgent work will appear here." />}
    </section>
  </AppShell>;
}
