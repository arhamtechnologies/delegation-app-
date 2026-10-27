'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Loader } from '../../components/Loader';
import { Icon } from '../../components/Icons';
import { EmptyState, PriorityBadge, StatusBadge } from '../../components/UI';
import { canCreateTasks, getCurrentEmployee } from '../../lib/auth';
import { getTaskEmployees } from '../../lib/task-data';
import { getUnifiedWorkItems, getWorkItemStatus } from '../../lib/work-data';

function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function getWorkLink(workItem) {
  return workItem.kind === 'checklist' ? `/tasks/checklist/${workItem.id}` : `/tasks/${workItem.id}`;
}

function getTaskType(workItem) {
  if (workItem.kind !== 'checklist') return workItem.category || 'Task';
  const frequency = workItem.template?.frequency || workItem.checklistItem?.template?.frequency;
  if (frequency === 'weekly') return 'Weekly checklist';
  if (frequency === 'every_15_days') return 'Every 15 days checklist';
  if (frequency === 'monthly') return 'Monthly checklist';
  return 'Checklist';
}

export default function FollowUpTasks() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    const { user, employee, error: employeeError } = await getCurrentEmployee();
    if (!user) { setLoading(false); return; }
    if (employeeError || !employee) {
      setError('Unable to load your workspace profile. Please try again.');
      setLoading(false);
      return;
    }
    const manager = canCreateTasks(employee.role);
    const [workResponse, employeeResponse] = await Promise.all([
      getUnifiedWorkItems({ employeeId: manager ? undefined : employee.id, followUpOnly: true, detail: 'list' }),
      manager ? getTaskEmployees() : Promise.resolve({ data: [employee], error: null }),
    ]);
    const responseError = workResponse.error || employeeResponse.error;
    if (responseError) setError(responseError.message || 'Follow-up tasks could not be loaded.');
    setData({ workItems: workResponse.data || [], employees: employeeResponse.data || [], manager });
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.workItems || []).filter((workItem) => {
      const searchable = [workItem.title, workItem.assignee?.name, workItem.assignee?.email].filter(Boolean).join(' ').toLowerCase();
      const status = getWorkItemStatus(workItem);
      return (!query || searchable.includes(query))
        && (employeeFilter === 'all' || workItem.assignee_id === employeeFilter)
        && (statusFilter === 'all' || status === statusFilter)
        && (priorityFilter === 'all' || workItem.priority === priorityFilter)
        && (!dateFilter || workItem.originalScheduledDate === dateFilter);
    });
  }, [data, dateFilter, employeeFilter, priorityFilter, search, statusFilter]);

  function clearFilters() {
    setSearch('');
    setEmployeeFilter('all');
    setStatusFilter('all');
    setPriorityFilter('all');
    setDateFilter('');
  }

  return <AppShell title="Follow-up tasks" eyebrow="Workspace / Follow-up tasks" description="Sunday and declared-holiday work carried to its next working day." actions={<Link className="button button-ghost button-small" href="/dashboard">Back to Dashboard</Link>}>
    {error && <div className="inline-alert error" role="alert"><Icon name="warning" size={16} />{error}<button className="button button-ghost button-small" type="button" onClick={load}>Try again</button></div>}
    <section className="panel follow-up-panel">
      <div className="filter-bar follow-up-filters">
        <label className="search-box"><Icon name="search" size={17} /><input aria-label="Search follow-up tasks" placeholder="Search task title or employee" value={search} onChange={(event) => setSearch(event.target.value)} disabled={!data} /></label>
        {data?.manager && <label className="filter-control"><span>Employee</span><select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}><option value="all">All employees</option>{data.employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></label>}
        <label className="filter-control"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} disabled={!data}><option value="all">All status</option><option value="pending">Pending</option><option value="overdue">Overdue</option><option value="completed">Completed</option></select></label>
        <label className="filter-control"><span>Priority</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} disabled={!data}><option value="all">All priorities</option><option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option></select></label>
        <label className="filter-control"><span>Original date</span><input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} disabled={!data} /></label>
        <button className="button button-ghost button-small filter-button" type="button" onClick={clearFilters} disabled={!data}><Icon name="filter" size={15} />Clear</button>
      </div>
      {loading ? <Loader label="Loading follow-up tasks..." /> : filteredItems.length ? <div className="report-table-scroll"><table className="report-table follow-up-table"><thead><tr><th>Task</th><th>Employee</th><th>Original scheduled</th><th>Follow-up date</th><th>Priority</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredItems.map((workItem) => <tr key={`${workItem.kind}-${workItem.id}`}><td><Link className="report-detail-link" href={getWorkLink(workItem)}>{workItem.title}</Link><span className="follow-up-task-type">{getTaskType(workItem)}</span></td><td>{workItem.assignee?.name || 'Unassigned'}</td><td>{formatDate(workItem.originalScheduledDate)}</td><td><strong>{formatDate(workItem.followUpDate)}</strong></td><td><PriorityBadge priority={workItem.priority} /></td><td><StatusBadge status={getWorkItemStatus(workItem)} compact /></td><td><Link className="button button-ghost button-small" href={getWorkLink(workItem)}>Open <Icon name="arrowUpRight" size={14} /></Link></td></tr>)}</tbody></table></div> : <EmptyState icon="calendar" title="No follow-up tasks found" description="Only work originally scheduled on a Sunday or declared holiday appears here." action={search || employeeFilter !== 'all' || statusFilter !== 'all' || priorityFilter !== 'all' || dateFilter ? 'Clear filters' : null} onAction={search || employeeFilter !== 'all' || statusFilter !== 'all' || priorityFilter !== 'all' || dateFilter ? clearFilters : undefined} />}
    </section>
  </AppShell>;
}
