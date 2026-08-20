'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { EmptyState, Modal, PriorityBadge, SectionHeader, StatusBadge } from '../../components/UI';
import { canCreateTasks, getCurrentEmployee } from '../../lib/auth';
import { canCompleteChecklist, formatChecklistDueAt, getChecklistItems, getChecklistTimeZone, setChecklistCompletion } from '../../lib/checklist-data';
import { getNextBusinessDate, localDateTimeToIso } from '../../lib/checklist-time';
import { createTask, formatTaskDeadline, getTaskEmployees, getTasks } from '../../lib/task-data';
import { getWorkItemScheduledDate, getWorkItemStatus, toChecklistWorkItem, toTaskWorkItem } from '../../lib/work-data';

const emptyForm = { title: '', description: '', assignee_id: '', eta: '', due_time: '', start_date: '', priority: 'normal', category: 'General', instructions: '', proof_required: true, completion_notes: null, attachments: [] };

function getLocalDateInputValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function isValidDateFilter(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

function getDateFilterRange(dateValue) {
  const timeZone = getChecklistTimeZone();
  return {
    etaFrom: localDateTimeToIso(dateValue, '00:00', timeZone),
    etaTo: localDateTimeToIso(getNextBusinessDate(dateValue), '00:00', timeZone),
  };
}

function TaskSummarySkeleton() {
  return <div className="inline-stat inline-stat-loading" aria-hidden="true"><span className="inline-stat-icon skeleton-shimmer" /><div><span className="summary-value-placeholder skeleton-shimmer" /><span className="summary-label-placeholder skeleton-shimmer" /></div></div>;
}

function getWorkDeadline(workItem) {
  return workItem.kind === 'checklist' ? formatChecklistDueAt(workItem.due_at) : formatTaskDeadline(workItem);
}

function getWorkLink(workItem) {
  return workItem.kind === 'checklist' ? `/tasks/checklist/${workItem.id}` : `/tasks/${workItem.id}`;
}

export default function Tasks() {
  const [taskData, setTaskData] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [filtersReady, setFiltersReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    function syncFiltersFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const statusValue = params.get('status');
      const priorityValue = params.get('priority');
      const dateValue = params.get('date');
      setEmployeeFilter(params.get('employee') || 'all');
      setStatus(['pending', 'overdue', 'completed'].includes(statusValue) ? statusValue : 'all');
      setPriority(['critical', 'high', 'normal'].includes(priorityValue) ? priorityValue : 'all');
      setDateFilter(isValidDateFilter(dateValue) ? dateValue : '');
    }

    syncFiltersFromUrl();
    setFiltersReady(true);
    window.addEventListener('popstate', syncFiltersFromUrl);
    return () => window.removeEventListener('popstate', syncFiltersFromUrl);
  }, []);

  function openCreateModal() {
    setForm({ ...emptyForm, start_date: getLocalDateInputValue() });
    setModalOpen(true);
  }

  const load = useCallback(async (overrides = {}) => {
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
    const selectedEmployeeId = Object.prototype.hasOwnProperty.call(overrides, 'employeeId') ? overrides.employeeId : (employeeFilter === 'all' ? null : employeeFilter);
    const selectedStatus = overrides.status ?? status;
    const selectedPriority = overrides.priority ?? priority;
    const selectedDate = overrides.date ?? dateFilter;
    const dateRange = selectedDate ? getDateFilterRange(selectedDate) : {};
    const employeeRequest = manager
      ? getTaskEmployees()
      : Promise.resolve({ data: [employee], error: null });
    const checklistRequest = selectedPriority !== 'all' && selectedPriority !== 'normal'
      ? Promise.resolve({ data: [], error: null })
      : getChecklistItems({ limit: 500, dueDate: selectedDate || undefined, employeeId: selectedEmployeeId || (!manager ? employee.id : null), status: selectedStatus === 'all' ? undefined : selectedStatus });
    const [taskResponse, checklistResponse, employeeResponse] = await Promise.all([
      getTasks({ limit: 200, assigneeId: selectedEmployeeId || undefined, status: selectedStatus === 'all' ? undefined : selectedStatus, priority: selectedPriority, ...dateRange }),
      checklistRequest,
      employeeRequest,
    ]);
    const responseError = taskResponse.error || employeeResponse.error;
    if (responseError) {
      setError(responseError.message || 'Unable to load tasks. Please try again.');
      setLoading(false);
      return;
    }
    setTaskData({
      role: employee.role,
      employeeId: employee.id,
      tasks: (taskResponse.data || []).map(toTaskWorkItem),
      checklistItems: (checklistResponse.data || []).map(toChecklistWorkItem),
      employees: employeeResponse.data || [],
    });
    if (checklistResponse.error) setError(checklistResponse.error.message || 'Checklist items could not be loaded.');
    setLoading(false);
  }, [dateFilter, employeeFilter, priority, status]);

  useEffect(() => { if (filtersReady) load(); }, [filtersReady, load]);

  useEffect(() => {
    if (taskData && !loading && canCreateTasks(taskData.role) && new URLSearchParams(window.location.search).get('create') === '1') openCreateModal();
  }, [loading, taskData]);

  const workItems = useMemo(() => [
    ...(taskData?.tasks || []),
    ...(taskData?.checklistItems || []),
  ].sort((left, right) => new Date(right.eta || right.due_at || 0).getTime() - new Date(left.eta || left.due_at || 0).getTime()), [taskData]);
  const employees = useMemo(() => taskData?.employees || [], [taskData]);
  const canCreate = Boolean(taskData && canCreateTasks(taskData.role));

  const filteredTasks = useMemo(() => workItems.filter((workItem) => {
    const query = search.trim().toLowerCase();
    const searchable = [workItem.title, workItem.description, workItem.assignee?.name, workItem.category, workItem.checklistItem?.template?.frequency].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !query || searchable.includes(query);
    const matchesEmployee = employeeFilter === 'all' || workItem.assignee_id === employeeFilter;
    const matchesDate = !dateFilter || getWorkItemScheduledDate(workItem, getChecklistTimeZone()) === dateFilter;
    const workStatus = getWorkItemStatus(workItem);
    return matchesSearch && matchesEmployee && matchesDate && (status === 'all' || workStatus === status) && (priority === 'all' || workItem.priority === priority);
  }), [workItems, search, employeeFilter, status, priority, dateFilter]);

  function updateForm(field, value) { setForm((current) => ({ ...current, [field]: value })); }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    if (!form.due_time) { setError('Please select a due time.'); setSaving(false); return; }
    const { user, employee } = await getCurrentEmployee();
    if (!user) { setError('Your session has expired. Please sign in again.'); setSaving(false); return; }
    if (!canCreateTasks(employee?.role)) { setError('Your role does not have permission to create tasks.'); setSaving(false); return; }
    const { error: createError } = await createTask(form, user.id);
    if (createError) setError(createError.message);
    else { setForm(emptyForm); setModalOpen(false); setMessage('Task created and assigned.'); await load(); }
    setSaving(false);
  }

  async function completeChecklist(workItem) {
    if (completing || getWorkItemStatus(workItem) === 'completed') return;
    setCompleting(workItem.id);
    setError('');
    const { error: updateError } = await setChecklistCompletion(workItem.id);
    if (updateError) setError(updateError.message);
    else { setMessage('Checklist item completed.'); await load(); }
    setCompleting(null);
  }

  function updateStatusFilter(nextStatus) {
    const normalizedStatus = ['pending', 'overdue', 'completed'].includes(nextStatus) ? nextStatus : 'all';
    setStatus(normalizedStatus);
    updateFilterUrl('status', normalizedStatus);
  }

  function updateEmployeeFilter(nextEmployeeId) {
    setEmployeeFilter(nextEmployeeId);
    updateFilterUrl('employee', nextEmployeeId);
  }

  function updatePriorityFilter(nextPriority) {
    setPriority(nextPriority);
    updateFilterUrl('priority', nextPriority);
  }

  function updateDateFilter(nextDate) {
    const normalizedDate = isValidDateFilter(nextDate) ? nextDate : '';
    setDateFilter(normalizedDate);
    updateFilterUrl('date', normalizedDate);
  }

  function updateFilterUrl(key, value) {
    const params = new URLSearchParams(window.location.search);
    if (!value || value === 'all') params.delete(key);
    else params.set(key, value);
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }

  function clearFilters() {
    setSearch('');
    setEmployeeFilter('all');
    setPriority('all');
    setStatus('all');
    setDateFilter('');
    const params = new URLSearchParams(window.location.search);
    params.delete('employee');
    params.delete('status');
    params.delete('priority');
    params.delete('date');
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }

  return <AppShell title={taskData ? 'Tasks' : 'Loading tasks'} eyebrow="Workspace / Tasks" description="Create, prioritize, and keep every assignment moving." actions={canCreate ? <button className="button button-primary" type="button" onClick={openCreateModal}><Icon name="plus" size={17} />Create task</button> : null}>
    {!taskData ? <section className="task-summary-row"><TaskSummarySkeleton /><TaskSummarySkeleton /><TaskSummarySkeleton /><TaskSummarySkeleton /></section> : <section className="task-summary-row"><div className="inline-stat"><span className="inline-stat-icon blue"><Icon name="clipboard" size={16} /></span><div><strong>{workItems.length}</strong><span>Total tasks</span></div></div><div className="inline-stat"><span className="inline-stat-icon orange"><Icon name="warning" size={16} /></span><div><strong>{workItems.filter((workItem) => getWorkItemStatus(workItem) === 'overdue').length}</strong><span>Overdue</span></div></div><div className="inline-stat"><span className="inline-stat-icon purple"><Icon name="clock" size={16} /></span><div><strong>{workItems.filter((workItem) => getWorkItemStatus(workItem) === 'pending').length}</strong><span>Pending</span></div></div><div className="inline-stat"><span className="inline-stat-icon mint"><Icon name="checkCircle" size={16} /></span><div><strong>{workItems.filter((workItem) => getWorkItemStatus(workItem) === 'completed').length}</strong><span>Completed</span></div></div></section>}
    {message && <div className="inline-alert success"><Icon name="checkCircle" size={16} />{message}</div>}
    {error && <div className="inline-alert error" role="alert"><Icon name="warning" size={16} />{error}<button className="button button-ghost button-small" type="button" onClick={load}>Try again</button></div>}
    <section className="panel task-panel">
      <SectionHeader eyebrow="Task inbox" title={taskData ? 'All work' : 'Loading tasks'} description="Search and filter tasks by urgency, owner, or workflow stage." />
      <div className="filter-bar">
        {canCreate && <label className="search-box"><Icon name="search" size={17} /><input aria-label="Search tasks" placeholder="Search tasks, people, or categories" value={search} onChange={(event) => setSearch(event.target.value)} disabled={!taskData} /></label>}
        {canCreate && <label className="filter-control"><span>Employee</span><select value={employeeFilter} onChange={(event) => updateEmployeeFilter(event.target.value)} disabled={!taskData}><option value="all">All employees</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></label>}
        <label className="filter-control"><span>Date</span><input type="date" value={dateFilter} onChange={(event) => updateDateFilter(event.target.value)} disabled={!taskData} /></label>
        <label className="filter-control"><span>Status</span><select value={status} onChange={(event) => updateStatusFilter(event.target.value)} disabled={!taskData}><option value="all">All status</option><option value="pending">Pending</option><option value="overdue">Overdue</option><option value="completed">Completed</option></select></label>
        <label className="filter-control"><span>Priority</span><select value={priority} onChange={(event) => updatePriorityFilter(event.target.value)} disabled={!taskData}><option value="all">All priorities</option><option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option></select></label>
        <button className="button button-ghost button-small filter-button" type="button" onClick={clearFilters} disabled={!taskData}><Icon name="filter" size={15} />Clear</button>
      </div>
      {!taskData ? (error ? <div className="data-error-state"><Icon name="warning" size={20} /><strong>Tasks could not be loaded.</strong><span>Check your connection and try again.</span><button className="button button-primary button-small" type="button" onClick={load}>Try again</button></div> : <div className="loading-list task-loading-list" aria-label="Loading tasks"><span /><span /><span /></div>) : filteredTasks.length ? <>
        <div className="task-table-heading"><span>Task</span><span>Owner</span><span>Priority</span><span>Status</span><span>Due</span><span /></div>
        <div className="task-list task-list-desktop">{filteredTasks.map((workItem) => { const workStatus = getWorkItemStatus(workItem); const href = getWorkLink(workItem); const canComplete = workItem.kind === 'checklist' && canCompleteChecklist(taskData.role, taskData.employeeId, workItem.employee_id) && workStatus !== 'completed'; return <div className="task-row task-row-grid" key={`${workItem.kind}-${workItem.id}`}><div className="task-row-main">{canComplete ? <button className="task-check task-check-button" type="button" onClick={() => completeChecklist(workItem)} disabled={completing === workItem.id} aria-label={`Complete ${workItem.title}`}><Icon name="checkSquare" size={18} /></button> : <span className="task-check"><Icon name={workStatus === 'completed' ? 'checkCircle' : workItem.kind === 'checklist' ? 'checkSquare' : 'clipboard'} size={18} /></span>}<div className="task-copy"><Link href={href} className="task-title">{workItem.title}</Link><div className="task-subline"><span className={workItem.kind === 'checklist' ? 'task-source-badge' : ''}>{workItem.kind === 'checklist' && <Icon name="checkSquare" size={11} />} {workItem.kind === 'checklist' ? 'Checklist' : workItem.category || 'General'}</span><span className="dot-separator" /><span>{workItem.description || 'No description added'}</span></div></div></div><div className="task-owner"><span className="avatar avatar-xs">{(workItem.assignee?.name || 'U').slice(0, 1).toUpperCase()}</span>{workItem.assignee?.name || 'Unassigned'}</div><PriorityBadge priority={workItem.priority} /><StatusBadge status={workStatus} compact /><span className={workStatus === 'overdue' ? 'due-date overdue' : 'due-date'}><Icon name="calendar" size={14} />{getWorkDeadline(workItem)}</span><Link className="row-action" href={href} aria-label={`Open ${workItem.title}`}><Icon name="chevronRight" size={17} /></Link></div>; })}</div>
        <div className="task-list task-list-mobile">{filteredTasks.map((workItem) => { const workStatus = getWorkItemStatus(workItem); const href = getWorkLink(workItem); return <div className="mobile-task-card" key={`${workItem.kind}-${workItem.id}`}><div className="mobile-task-card-top"><Link href={href} className="task-title">{workItem.title}</Link><StatusBadge status={workStatus} compact /></div><div className="mobile-task-card-meta"><span>{workItem.assignee?.name || 'Unassigned'}</span><PriorityBadge priority={workItem.priority} /><span className={workStatus === 'overdue' ? 'overdue' : ''}><Icon name="calendar" size={13} />{getWorkDeadline(workItem)}</span></div><p>{workItem.description || 'No description added'}</p><div className="mobile-task-card-footer"><span>{workItem.kind === 'checklist' ? 'Checklist' : workItem.category || 'General'}</span></div></div>; })}</div>
      </> : <EmptyState icon="clipboard" title="No tasks match these filters" description="Try a different search or clear the filters to see more work." action={canCreate ? 'Create a task' : null} onAction={canCreate ? openCreateModal : undefined} />}
    </section>
    {canCreate && <Modal open={modalOpen} title="Create a task" description="Give one person a clear next step with enough context to finish well." onClose={() => setModalOpen(false)} wide><form className="modal-form" onSubmit={submit}><div className="form-grid form-grid-two"><div className="field field-wide"><label htmlFor="task-title">Task title<span>*</span></label><input id="task-title" className="input" required placeholder="e.g. Prepare weekly sales summary" value={form.title} onChange={(event) => updateForm('title', event.target.value)} /></div><div className="field"><label htmlFor="task-assignee">Assign to<span>*</span></label><select id="task-assignee" className="input" required value={form.assignee_id} onChange={(event) => updateForm('assignee_id', event.target.value)}><option value="">Choose a person</option>{(taskData?.role && employees.filter((employee) => employee.role !== 'super_admin' && employee.role !== 'assigner' && employee.role !== 'ea')).map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></div><div className="field"><label htmlFor="task-priority">Priority</label><select id="task-priority" className="input" value={form.priority} onChange={(event) => updateForm('priority', event.target.value)}><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div><div className="field"><label htmlFor="task-due">Due date<span>*</span></label><input id="task-due" className="input" type="date" required value={form.eta} onChange={(event) => updateForm('eta', event.target.value)} /></div><div className="field"><label htmlFor="task-due-time">Due time<span>*</span></label><input id="task-due-time" className="input" type="time" required value={form.due_time} onChange={(event) => updateForm('due_time', event.target.value)} /></div><div className="field"><label htmlFor="task-start">Start date</label><input id="task-start" className="input" type="date" value={form.start_date} onChange={(event) => updateForm('start_date', event.target.value)} /></div><div className="field field-wide"><label htmlFor="task-description">Description</label><textarea id="task-description" className="input" rows="4" placeholder="What does done look like?" value={form.description} onChange={(event) => updateForm('description', event.target.value)} /></div><div className="field field-wide"><label htmlFor="task-instructions">Instructions or handoff notes</label><textarea id="task-instructions" className="input" rows="3" placeholder="Add links, context, or specific expectations." value={form.instructions} onChange={(event) => updateForm('instructions', event.target.value)} /></div><label className="checkbox-field field-wide"><input type="checkbox" checked={form.proof_required} onChange={(event) => updateForm('proof_required', event.target.checked)} /><span><strong>Ask for completion proof</strong><small>Keep the handoff auditable when the task is submitted.</small></span></label></div>{error && <div className="form-error"><Icon name="warning" size={16} />{error}</div>}<div className="modal-actions"><button className="button button-ghost" type="button" onClick={() => setModalOpen(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create task'}{!saving && <Icon name="arrowUpRight" size={16} />}</button></div></form></Modal>}
  </AppShell>;
}
