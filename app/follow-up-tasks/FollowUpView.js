'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { ClearFiltersButton, FilterDate, FilterSelect, InlineError, ListEmpty, ListSkeleton, MetaChip, Surface, SurfaceHeader, Toolbar, ToolbarSearch } from '../../components/Workflow';
import { GroupedWorkList, WorkColumnsHeader, WorkItemRow } from '../../components/WorkList';
import { Button } from '@/components/ui/button';
import { getCurrentEmployee } from '../../lib/auth';
import { isFreshRender, loadFollowUpData } from '../../lib/page-data';
import { getWorkItemStatus } from '../../lib/work-data';

function formatDay(value) {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function getTaskType(workItem) {
  if (workItem.kind !== 'checklist') return workItem.category || 'Task';
  const frequency = workItem.template?.frequency || workItem.checklistItem?.template?.frequency || workItem.checklist_frequency;
  if (frequency === 'weekly') return 'Weekly';
  if (frequency === 'every_15_days') return 'Every 15 days';
  if (frequency === 'monthly') return 'Monthly';
  return 'Checklist';
}

export default function FollowUpView({ initialData }) {
  const [data, setData] = useState(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    const { user, employee, error: employeeError } = await getCurrentEmployee();
    if (!user) { setLoading(false); return; }
    if (employeeError || !employee) { setError('Unable to load your workspace profile. Please try again.'); setLoading(false); return; }
    const response = await loadFollowUpData({ employee });
    if (response.error) setError(response.error.message || 'Follow-up tasks could not be loaded.');
    else setData(response.data);
    setLoading(false);
  }

  useEffect(() => { if (!isFreshRender(initialData)) load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.workItems || []).filter((workItem) => {
      const searchable = [workItem.title, workItem.assignee?.name, workItem.assignee?.email].filter(Boolean).join(' ').toLowerCase();
      return (!query || searchable.includes(query))
        && (employeeFilter === 'all' || workItem.assignee_id === employeeFilter)
        && (statusFilter === 'all' || getWorkItemStatus(workItem) === statusFilter)
        && (typeFilter === 'all' || workItem.kind === typeFilter)
        && (priorityFilter === 'all' || workItem.priority === priorityFilter)
        && (!dateFilter || workItem.originalScheduledDate === dateFilter);
    });
  }, [data, dateFilter, employeeFilter, priorityFilter, search, statusFilter, typeFilter]);
  const filtersActive = Boolean(search || employeeFilter !== 'all' || statusFilter !== 'all' || priorityFilter !== 'all' || typeFilter !== 'all' || dateFilter);

  function clearFilters() { setSearch(''); setEmployeeFilter('all'); setStatusFilter('all'); setPriorityFilter('all'); setTypeFilter('all'); setDateFilter(''); }

  return <AppShell title="Follow-ups" description="Sunday and holiday work carried over to the next working day.">
    <Surface>
      <SurfaceHeader title="Carried-over work" description={data ? `${filteredItems.length} item${filteredItems.length === 1 ? '' : 's'}` : undefined} />
      <Toolbar search={<ToolbarSearch value={search} onChange={setSearch} placeholder="Search task or person" label="Search follow-up tasks" disabled={!data} />}>
        {data?.manager && <FilterSelect label="Person" value={employeeFilter} onChange={setEmployeeFilter}><option value="all">Anyone</option>{data.employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</FilterSelect>}
        <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} disabled={!data}><option value="all">Any</option><option value="pending">Pending</option><option value="overdue">Overdue</option><option value="completed">Completed</option></FilterSelect>
        <FilterSelect label="Priority" value={priorityFilter} onChange={setPriorityFilter} disabled={!data}><option value="all">Any</option><option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option></FilterSelect>
        <FilterSelect label="Type" value={typeFilter} onChange={setTypeFilter} disabled={!data}><option value="all">All work</option><option value="task">Tasks</option><option value="checklist">Checklist</option></FilterSelect>
        <FilterDate label="Originally" value={dateFilter} onChange={setDateFilter} disabled={!data} />
        <ClearFiltersButton visible={filtersActive} onClick={clearFilters} />
      </Toolbar>
      <InlineError message={error} onRetry={load} />
      {loading && !data ? <ListSkeleton /> : filteredItems.length
        ? <><WorkColumnsHeader showPerson={Boolean(data?.manager)} extraLabel="Carried from" /><GroupedWorkList workItems={filteredItems} openStatus={statusFilter === 'all' ? undefined : statusFilter} renderRow={(workItem) => <WorkItemRow key={`${workItem.kind}-${workItem.id}`} workItem={workItem} showAssignee={data?.manager} extra={`${getTaskType(workItem)} · ${formatDay(workItem.originalScheduledDate)}`} />} /></>
        : <ListEmpty icon="calendar" title="No follow-up work" description="Only work originally scheduled on a Sunday or declared holiday appears here." action={filtersActive ? <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : null} />}
    </Surface>
  </AppShell>;
}
