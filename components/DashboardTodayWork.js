'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from './Icons';
import { EmptyState, PriorityBadge, StatusBadge } from './UI';
import { formatChecklistDueAt } from '../lib/checklist-data';
import { formatTaskDeadline } from '../lib/task-data';
import { getWorkItemStatus, sortTodaysWorkItems } from '../lib/work-data';

function getTaskDueDisplay(task) {
  if (task.kind === 'checklist') return { label: formatChecklistDueAt(task.due_at), overdue: getWorkItemStatus(task) === 'overdue' };
  return { label: formatTaskDeadline(task, { relative: true }), overdue: getWorkItemStatus(task) === 'overdue' };
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

export default function DashboardTodayWork({ manager, employees, todayTasks }) {
  const [search, setSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const filteredTodayTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sortTodaysWorkItems((todayTasks || []).filter((task) => {
      const searchable = [task.title, task.description, task.assignee?.name, task.assignee?.email, task.category].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !query || searchable.includes(query);
      const matchesEmployee = employeeFilter === 'all' || task.assignee_id === employeeFilter;
      const taskStatus = getWorkItemStatus(task);
      return matchesSearch && matchesEmployee && (statusFilter === 'all' || taskStatus === statusFilter);
    }));
  }, [employeeFilter, search, statusFilter, todayTasks]);
  const filtersActive = Boolean(search.trim() || employeeFilter !== 'all' || statusFilter !== 'all');
  function clearFilters() {
    setSearch('');
    setEmployeeFilter('all');
    setStatusFilter('all');
  }

  return <section className="panel overview-panel">
    <div className="section-header dashboard-today-heading"><div><h2>Today&apos;s tasks</h2><p>Today&apos;s scheduled work is loaded separately from the dashboard summary.</p></div><div className="dashboard-heading-actions"><Link className="button button-primary dashboard-follow-up-button" href="/follow-up-tasks">Follow-up tasks</Link><Link className="text-link" href="/tasks">View all <Icon name="arrowUpRight" size={14} /></Link></div></div>
    <div className="filter-bar dashboard-task-filters">
      {manager && <label className="search-box"><Icon name="search" size={17} /><input aria-label="Search dashboard tasks or employees" placeholder="Search tasks or employees" value={search} onChange={(event) => setSearch(event.target.value)} /></label>}
      {manager && <label className="filter-control"><span>Employee</span><select aria-label="Filter dashboard tasks by employee" value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}><option value="all">All employees</option>{(employees || []).map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></label>}
      <label className="filter-control"><span>Status</span><select aria-label="Filter dashboard tasks by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All status</option><option value="pending">Pending</option><option value="overdue">Overdue</option><option value="completed">Completed</option></select></label>
      <button className="button button-ghost button-small filter-button" type="button" onClick={clearFilters}><Icon name="filter" size={15} />Clear</button>
    </div>
    {filteredTodayTasks.length ? <ul className="dashboard-task-list">{filteredTodayTasks.map((task) => <DashboardTaskRow key={`${task.kind}-${task.id}`} task={task} />)}</ul> : <EmptyState compact icon="checkCircle" title={filtersActive ? 'No tasks match these filters.' : 'No tasks scheduled for today.'} description={filtersActive ? 'Try a different search or clear the filters to see more work.' : 'Everything scheduled for today will appear here.'} action={filtersActive ? 'Clear filters' : null} onAction={filtersActive ? clearFilters : undefined} />}
  </section>;
}
