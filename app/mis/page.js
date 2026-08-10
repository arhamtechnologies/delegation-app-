'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { EmptyState, MetricCard, ProgressBar, SectionHeader } from '../../components/UI';
import { getAuthenticatedUser } from '../../lib/auth';
import { getTasks, taskIsOverdue } from '../../lib/task-data';
import { supabaseBrowser } from '../../lib/supabase-browser';

export default function MIS() {
  const [rows, setRows] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const user = await getAuthenticatedUser();
    if (!user) return;
    const [{ data: reportRows = [] } = {}, { data: taskRows = [] } = {}] = await Promise.all([
      supabaseBrowser().from('employee_mis').select('employee_id,employee_name,total_tasks,pending_tasks,delayed_tasks,closed_tasks,on_time_percent').order('employee_name'),
      getTasks({ limit: 500 }),
    ]);
    setRows(reportRows || []);
    setTasks(taskRows || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filteredRows = useMemo(() => rows.filter((row) => row.employee_name?.toLowerCase().includes(search.toLowerCase())), [rows, search]);
  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const date = task.eta ? new Date(task.eta).getTime() : 0;
    const afterFrom = !from || date >= new Date(`${from}T00:00:00`).getTime();
    const beforeTo = !to || date <= new Date(`${to}T23:59:59`).getTime();
    return (status === 'all' || (status === 'overdue' ? taskIsOverdue(task) : task.status === status)) && afterFrom && beforeTo;
  }), [tasks, status, from, to]);

  const completed = filteredTasks.filter((task) => task.status === 'closed').length;
  const onTime = filteredTasks.filter((task) => task.status === 'closed' && task.completed_at && task.eta && new Date(task.completed_at) <= new Date(task.eta)).length;
  const onTimeRate = completed ? Math.round((onTime / completed) * 100) : 0;

  function exportCsv() {
    const header = ['Employee', 'Total Tasks', 'Pending', 'In Progress', 'Delayed', 'Completed', 'On-time %'];
    const values = filteredRows.map((row) => [row.employee_name, row.total_tasks, row.pending_tasks, row.pending_tasks, row.delayed_tasks, row.closed_tasks, `${row.on_time_percent}%`]);
    const csv = [header, ...values].map((line) => line.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = 'delegation-mis-report.csv'; link.click(); URL.revokeObjectURL(url);
  }

  return <AppShell title="MIS reports" eyebrow="Manage / MIS reports" description="A clearer picture of workload, delivery, and follow-through." actions={<><button className="button button-ghost button-small" type="button" onClick={() => window.print()}><Icon name="download" size={15} />Print report</button><button className="button button-primary" type="button" onClick={exportCsv}><Icon name="download" size={16} />Export CSV</button></>}>
    <section className="metric-grid metric-grid-four"><MetricCard label="Total tasks" value={filteredTasks.length} change="Filtered period" tone="blue" icon="clipboard" /><MetricCard label="Overdue" value={filteredTasks.filter(taskIsOverdue).length} change="Needs attention" tone="orange" icon="warning" /><MetricCard label="Completed" value={completed} change="In this period" tone="mint" icon="checkCircle" /><MetricCard label="On-time rate" value={`${onTimeRate}%`} change="Completed tasks" tone="purple" icon="trend" /></section>
    <section className="panel report-panel"><SectionHeader eyebrow="Report controls" title="Filter the view" description="Use the same report to review an individual, a period, or the whole team." /><div className="filter-bar report-filters"><label className="search-box"><Icon name="search" size={17} /><input aria-label="Search report employees" placeholder="Search employees" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="filter-control"><span>From</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="filter-control"><span>To</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><label className="filter-control"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="pending">To do</option><option value="followup">In progress</option><option value="submitted">In review</option><option value="closed">Completed</option><option value="overdue">Overdue</option></select></label></div></section>
    <div className="report-layout"><section className="panel report-table-panel"><SectionHeader eyebrow="People performance" title="Employee-wise performance" /><div className="report-table-scroll">{loading ? <div className="loading-list"><span /><span /></div> : filteredRows.length ? <table className="report-table"><thead><tr><th>Employee</th><th>Total</th><th>Pending</th><th>In progress</th><th>Delayed</th><th>Completed</th><th>On-time</th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row.employee_id}><td><strong>{row.employee_name}</strong></td><td>{row.total_tasks}</td><td>{row.pending_tasks}</td><td>{row.pending_tasks}</td><td>{row.delayed_tasks}</td><td>{row.closed_tasks}</td><td><div className="table-progress"><span>{row.on_time_percent}%</span><ProgressBar value={row.on_time_percent} tone="mint" /></div></td></tr>)}</tbody></table> : <EmptyState compact icon="chart" title="No report data" description="Employee performance will appear after tasks are assigned." />}</div></section><section className="panel breakdown-panel"><SectionHeader eyebrow="Task mix" title="Status breakdown" /><div className="breakdown-list">{[['To do', 'pending', 'blue'], ['In progress', 'followup', 'purple'], ['Delayed', 'delayed', 'orange'], ['In review', 'submitted', 'violet'], ['Completed', 'closed', 'mint']].map(([label, key, tone]) => { const value = filteredTasks.filter((task) => task.status === key).length; const percent = filteredTasks.length ? Math.round((value / filteredTasks.length) * 100) : 0; return <div className="breakdown-item" key={key}><div><span className={`breakdown-dot ${tone}`} />{label}<strong>{value}</strong></div><ProgressBar value={percent} tone={tone === 'violet' ? 'purple' : tone} /></div>; })}</div><div className="report-insight"><span className="insight-icon"><Icon name="sparkles" size={16} /></span><div><strong>Delivery insight</strong><p>{onTimeRate >= 80 ? 'Your team is keeping a strong delivery rhythm.' : 'A focused review of overdue work could improve delivery confidence.'}</p></div></div></section></div>
  </AppShell>;
}
