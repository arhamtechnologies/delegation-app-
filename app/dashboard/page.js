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

export default function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [name, setName] = useState('there');
  const [role, setRole] = useState('doer');
  const [activeEmployees, setActiveEmployees] = useState(0);
  const [loading, setLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(false);

  async function load() {
    setLoading(true);
    const { user, employee } = await getCurrentEmployee();
    if (!user) return;
    const manager = ['super_admin', 'assigner', 'ea'].includes(employee?.role);
    setName(employee?.name || 'there');
    setRole(employee?.role || 'doer');
    setCanCreate(canCreateTasks(employee?.role));
    const taskRequest = getTasks({ limit: 100 });
    const employeeRequest = manager
      ? supabaseBrowser().from('employees').select('id', { count: 'exact', head: true }).eq('active', true)
      : Promise.resolve({ count: 0 });
    const [{ data: taskRows = [] } = {}, { count = 0 } = {}] = await Promise.all([taskRequest, employeeRequest]);
    setTasks(taskRows || []);
    setActiveEmployees(count || 0);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const manager = ['super_admin', 'assigner', 'ea'].includes(role);
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

  return <AppShell title={manager ? 'Dashboard' : 'My Tasks'} eyebrow="Workspace" actions={canCreate ? <Link className="button button-primary" href="/tasks?create=1"><Icon name="plus" size={17} />Create task</Link> : null}>
    <section className="overview-intro"><p>Good morning, <strong>{name}</strong></p><span>Here is what needs your attention.</span></section>
    <section className="metric-grid overview-metrics" aria-label="Task summary">
      {manager ? <><MetricCard label="Total tasks" value={loading ? 'â€”' : metrics.total} href="/tasks" /><MetricCard label="Overdue" value={loading ? 'â€”' : metrics.overdue} tone={metrics.overdue ? 'orange' : 'green'} href="/tasks?status=overdue" /><MetricCard label="Due soon" value={loading ? 'â€”' : metrics.dueSoon} tone="purple" href="/tasks" /><MetricCard label="Active employees" value={loading ? 'â€”' : activeEmployees} tone="mint" href="/employees" /></> : <><MetricCard label="My open tasks" value={loading ? 'â€”' : metrics.open} href="/tasks" /><MetricCard label="Due today" value={loading ? 'â€”' : metrics.dueToday} tone="purple" href="/tasks" /><MetricCard label="Overdue" value={loading ? 'â€”' : metrics.overdue} tone={metrics.overdue ? 'orange' : 'green'} href="/tasks?status=overdue" /><MetricCard label="Completed" value={loading ? 'â€”' : metrics.completed} tone="mint" href="/tasks?status=closed" /></>}
    </section>
    <section className="panel overview-panel">
      <div className="simple-section-heading"><div><h2>{manager ? 'Tasks needing attention' : 'My Tasks'}</h2><p>{manager ? 'Overdue and due-soon work appears here first.' : 'Your overdue and due-soon work appears here first.'}</p></div><Link className="text-link" href="/tasks">View all <Icon name="arrowUpRight" size={14} /></Link></div>
      {loading ? <div className="loading-list"><span /><span /><span /></div> : priorityTasks.length ? <div className="simple-task-table">
        <div className="simple-table-heading"><span>Task</span><span>Assignee</span><span>Priority</span><span>Status</span><span>Due date</span><span /></div>
        {priorityTasks.map((task) => <div className="simple-task-row" key={task.id}><div><Link href={`/tasks/${task.id}`} className="task-title">{task.title}</Link><small>{task.category || 'General'}</small></div><span>{task.assignee?.name || 'Unassigned'}</span><PriorityBadge priority={task.priority} /><StatusBadge status={task.status} compact /><span className={taskIsOverdue(task) ? 'due-date overdue' : 'due-date'}>{formatDate(task.eta, { month: 'short', day: 'numeric' })}</span><div className="simple-row-action"><select className="status-select" aria-label={`Change status for ${task.title}`} value={task.status} onChange={(event) => changeStatus(task.id, event.target.value)}><option value="pending">To do</option><option value="followup">In progress</option><option value="submitted">In review</option><option value="closed">Completed</option><option value="not_required">Not required</option></select></div></div>)}
      </div> : <EmptyState compact icon="checkCircle" title="No priority tasks" description="You are all caught up. New urgent work will appear here." />}
    </section>
  </AppShell>;
}
