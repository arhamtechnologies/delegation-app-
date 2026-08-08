'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { EmptyState, MetricCard, ProgressBar, SectionHeader, StatusBadge, TaskRow, formatDateTime, relativeTime } from '../../components/UI';
import { getTasks, taskIsDueSoon, taskIsOverdue, updateTaskStatus } from '../../lib/task-data';
import { supabaseBrowser } from '../../lib/supabase-browser';

function isToday(value) {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

export default function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [peopleCount, setPeopleCount] = useState(0);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: taskRows = [] } = {}, { count = 0 } = {}] = await Promise.all([
      getTasks({ limit: 100 }),
      supabaseBrowser().from('employees').select('id', { count: 'exact', head: true }),
    ]);
    setTasks(taskRows || []);
    setPeopleCount(count || 0);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const metrics = useMemo(() => {
    const completed = tasks.filter((task) => task.status === 'closed').length;
    const overdue = tasks.filter(taskIsOverdue).length;
    const dueSoon = tasks.filter(taskIsDueSoon).length;
    const submitted = tasks.filter((task) => task.status === 'submitted').length;
    return { total: tasks.length, completed, overdue, dueSoon, submitted, completion: tasks.length ? Math.round((completed / tasks.length) * 100) : 0 };
  }, [tasks]);

  async function changeStatus(id, status) {
    await updateTaskStatus(id, status);
    load();
  }

  const attention = tasks.filter((task) => taskIsOverdue(task) || taskIsDueSoon(task)).slice(0, 5);
  const recent = tasks.slice(0, 5);

  return <AppShell title="Good morning" eyebrow="Monday, August 8, 2026" description="Here is what needs your attention today." actions={<><Link className="button button-ghost button-small" href="/notifications"><Icon name="bell" size={16} />Updates <span className="button-count">3</span></Link><Link className="button button-primary" href="/tasks?create=1"><Icon name="plus" size={17} />Create task</Link></>}>
    <section className="hero-strip"><div><span className="hero-kicker"><Icon name="sparkles" size={14} />Your workspace at a glance</span><h2>Keep every handoff moving.</h2><p>Stay ahead of deadlines, follow-ups, and the work that matters most.</p></div><div className="hero-progress"><div className="hero-progress-top"><span>Team completion</span><strong>{metrics.completion}%</strong></div><ProgressBar value={metrics.completion} tone="mint" /><small>{metrics.completed} of {metrics.total || 0} tasks completed</small></div></section>
    <section className="metric-grid"><MetricCard label="All tasks" value={loading ? '—' : metrics.total} change="This cycle" tone="blue" icon="clipboard" href="/tasks" /><MetricCard label="Overdue" value={loading ? '—' : metrics.overdue} change={metrics.overdue ? 'Needs attention' : 'Looking good'} tone={metrics.overdue ? 'orange' : 'green'} icon="warning" href="/tasks?status=overdue" /><MetricCard label="Due soon" value={loading ? '—' : metrics.dueSoon} change="Next 48 hours" tone="purple" icon="clock" href="/tasks" /><MetricCard label="People active" value={loading ? '—' : peopleCount} change="In workspace" tone="mint" icon="users" href="/employees" /></section>
    <div className="dashboard-layout"><section className="panel attention-panel"><SectionHeader eyebrow="Priority queue" title="Needs attention" description="The tasks most likely to affect your week." action="View all" href="/tasks" />{attention.length ? <div className="task-list">{attention.map((task) => <TaskRow key={task.id} task={task} onStatusChange={changeStatus} />)}</div> : <EmptyState compact icon="checkCircle" title="You are all caught up" description="No overdue or due-soon tasks need attention right now." />}</section><section className="panel pulse-panel"><SectionHeader eyebrow="Team health" title="Workload pulse" description="A simple view of task movement across your workspace." /><div className="pulse-chart"><svg viewBox="0 0 520 180" role="img" aria-label="Workload trend"><defs><linearGradient id="pulseFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#6d62f6" stopOpacity=".25" /><stop offset="1" stopColor="#6d62f6" stopOpacity="0" /></linearGradient></defs><path d="M0 140 C55 130 74 92 122 106 S186 141 230 97 S298 43 342 72 S405 115 458 57 S490 40 520 20 V180 H0Z" fill="url(#pulseFill)" /><path d="M0 140 C55 130 74 92 122 106 S186 141 230 97 S298 43 342 72 S405 115 458 57 S490 40 520 20" fill="none" stroke="#6d62f6" strokeWidth="3" strokeLinecap="round" /></svg><div className="chart-axis"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></div><div className="pulse-stats"><div><span className="stat-label">In review</span><strong>{metrics.submitted}</strong><small>awaiting review</small></div><div><span className="stat-label">Completed</span><strong>{metrics.completed}</strong><small>this cycle</small></div><div><span className="stat-label">People</span><strong>{peopleCount}</strong><small>active members</small></div></div></section></div>
    <section className="panel activity-panel"><SectionHeader eyebrow="Recent movement" title="Latest task activity" action="Open task list" href="/tasks" />{recent.length ? <div className="activity-list">{recent.map((task) => <div className="activity-item" key={task.id}><span className="activity-line" /><span className="activity-icon"><Icon name={task.status === 'closed' ? 'checkCircle' : 'activity'} size={16} /></span><div><p><strong>{task.assignee?.name || 'A team member'}</strong> owns <Link href={`/tasks/${task.id}`}>{task.title}</Link></p><small>{relativeTime(task.updated_at || task.created_at)} · Due {formatDateTime(task.eta)}</small></div><StatusBadge status={task.status} compact /></div>)}</div> : <EmptyState compact icon="activity" title="No activity yet" description="New task updates will appear here." />}</section>
  </AppShell>;
}
