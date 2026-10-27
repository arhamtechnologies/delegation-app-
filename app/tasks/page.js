'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Loader } from '../../components/Loader';
import { Icon } from '../../components/Icons';
import TaskTextTooltip from '../../components/TaskTextTooltip';
import { EmptyState, Modal, PriorityBadge, SectionHeader, StatusBadge } from '../../components/UI';
import { canCreateTasks, getAccessToken, getCurrentEmployee, peekCurrentEmployee } from '../../lib/auth';
import { peekQuery, queryKey, setQuery } from '../../lib/query-cache';
import { canCompleteChecklist, formatChecklistDueAt, setChecklistCompletion } from '../../lib/checklist-data';
import { createTask, formatTaskDeadline, getTaskEmployees } from '../../lib/task-data';
import { getWorkItemsPage, getWorkItemStatus, getWorkReport } from '../../lib/work-data';
import { getPageCount, isLatestRequest, WORK_PAGE_SIZE } from '../../lib/work-list.mjs';

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

function getWorkDeadline(workItem) {
  if (workItem.isFollowUp) return `Original ${formatDateLabel(workItem.originalScheduledDate)} · Follow-up ${formatDateLabel(workItem.followUpDate)}`;
  return workItem.kind === 'checklist' ? formatChecklistDueAt(workItem.due_at) : formatTaskDeadline(workItem);
}

function formatDateLabel(value) {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function getWorkLink(workItem) {
  return workItem.kind === 'checklist' ? `/tasks/checklist/${workItem.id}` : `/tasks/${workItem.id}`;
}

export default function Tasks() {
  const [taskData, setTaskData] = useState(() => peekQuery(queryKey('tasks-workspace', peekCurrentEmployee()?.employee?.id)) || null);
  const [form, setForm] = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [workType, setWorkType] = useState('all');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [followUpFilter, setFollowUpFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [filtersReady, setFiltersReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [workSummary, setWorkSummary] = useState({ total: 0, pending: 0, overdue: 0, completed: 0 });
  const [workspaceReload, setWorkspaceReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);
  const abortRef = useRef(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    function syncFiltersFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const statusValue = params.get('status');
      const priorityValue = params.get('priority');
      const dateValue = params.get('date');
      const workTypeValue = params.get('workType');
      const followUpValue = params.get('followUp');
      setEmployeeFilter(params.get('employee') || 'all');
      setWorkType(['task', 'checklist'].includes(workTypeValue) ? workTypeValue : 'all');
      setStatus(['pending', 'overdue', 'completed'].includes(statusValue) ? statusValue : 'all');
      setPriority(['critical', 'high', 'normal'].includes(priorityValue) ? priorityValue : 'all');
      setFollowUpFilter(followUpValue === '1' ? 'follow-up' : 'all');
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    async function loadWorkspace() {
      setError('');
      const { user, employee, error: employeeError } = await getCurrentEmployee();
      if (!active || !user) return;
      if (employeeError || !employee) {
        setError('Unable to load your workspace profile. Please try again.');
        setLoading(false);
        return;
      }
      const manager = canCreateTasks(employee.role);
      const employeeResponse = manager ? await getTaskEmployees() : { data: [employee], error: null };
      if (!active) return;
      if (employeeResponse.error) {
        setError(employeeResponse.error.message || 'Unable to load employees. Please try again.');
        setLoading(false);
        return;
      }
      const workspace = { role: employee.role, employeeId: employee.id, employees: employeeResponse.data || [] };
      setQuery(queryKey('tasks-workspace', employee.id), workspace);
      setTaskData((current) => ({ ...current, ...workspace }));
    }
    loadWorkspace();
    return () => { active = false; };
  }, [workspaceReload]);

  const taskRole = taskData?.role;
  const taskEmployeeId = taskData?.employeeId;

  const load = useCallback(async () => {
    if (!filtersReady || !taskRole || !taskEmployeeId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const listKey = queryKey('tasks', taskEmployeeId, [page, debouncedSearch, employeeFilter, workType, status, priority, dateFilter].join('|'));
    const cachedList = peekQuery(listKey);
    if (cachedList) {
      setTaskData((current) => ({ ...current, workItems: cachedList.workItems }));
      if (cachedList.total !== undefined) setTotal(cachedList.total);
      if (cachedList.summary) setWorkSummary(cachedList.summary);
      loadedRef.current = true;
      setLoading(false);
    }
    if (loadedRef.current) setRefreshing(true);
    else setLoading(true);
    setError('');
    const manager = canCreateTasks(taskRole);
    const selectedEmployeeId = employeeFilter === 'all' ? (!manager ? taskEmployeeId : null) : employeeFilter;
    try {
      const [workResponse, summaryResponse] = await Promise.all([
        getWorkItemsPage({
          page,
          pageSize: WORK_PAGE_SIZE,
          search: debouncedSearch,
          employeeId: selectedEmployeeId,
          workType,
          status,
          priority,
          dueDate: dateFilter,
          includeCount: page === 0,
          signal: controller.signal,
        }),
        !manager ? getWorkReport({ workType, status, priority, employeeId: selectedEmployeeId, from: dateFilter, to: dateFilter, search: debouncedSearch, signal: controller.signal }) : Promise.resolve({ data: null, error: null }),
      ]);
      if (controller.signal.aborted || !isLatestRequest(requestId, requestIdRef.current)) return;
      const responseError = workResponse.error || summaryResponse.error;
      if (responseError) throw responseError;
      setTaskData((current) => ({ ...current, workItems: workResponse.data || [] }));
      const hasCount = workResponse.count !== null && workResponse.count !== undefined;
      setQuery(listKey, { workItems: workResponse.data || [], total: hasCount ? workResponse.count : cachedList?.total, summary: summaryResponse.data?.summary || cachedList?.summary });
      if (hasCount) setTotal(workResponse.count);
      if (summaryResponse.data?.summary) setWorkSummary(summaryResponse.data.summary);
      loadedRef.current = true;
    } catch (loadError) {
      if (!controller.signal.aborted && isLatestRequest(requestId, requestIdRef.current)) setError(loadError.message || 'Unable to load tasks. Please try again.');
    } finally {
      if (!controller.signal.aborted && isLatestRequest(requestId, requestIdRef.current)) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [dateFilter, debouncedSearch, employeeFilter, filtersReady, page, priority, status, taskEmployeeId, taskRole, workType]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => abortRef.current?.abort(), []);

  function retryLoad() {
    if (taskData) load();
    else setWorkspaceReload((value) => value + 1);
  }

  useEffect(() => {
    if (taskData && !loading && canCreateTasks(taskData.role) && new URLSearchParams(window.location.search).get('create') === '1') openCreateModal();
  }, [loading, taskData]);

  const workItems = useMemo(() => (taskData?.workItems || []).filter((workItem) => followUpFilter === 'all' || workItem.isFollowUp), [taskData, followUpFilter]);
  const employees = useMemo(() => taskData?.employees || [], [taskData]);
  const canCreate = Boolean(taskData && canCreateTasks(taskData.role));

  const totalPages = getPageCount(total, WORK_PAGE_SIZE);

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

  async function deleteTask(workItem) {
    if (!canCreate || workItem.kind === 'checklist' || deletingTaskId) return;
    if (!window.confirm(`Permanently delete "${workItem.title}"? This also removes its updates and notifications. This cannot be undone.`)) return;
    setDeletingTaskId(workItem.id);
    setError('');
    setMessage('');
    const token = await getAccessToken();
    const response = await fetch('/api/tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ id: workItem.id }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The task could not be deleted.');
    else { setMessage('Task deleted.'); await load(); }
    setDeletingTaskId(null);
  }

  function updateStatusFilter(nextStatus) {
    const normalizedStatus = ['pending', 'overdue', 'completed'].includes(nextStatus) ? nextStatus : 'all';
    setStatus(normalizedStatus);
    setPage(0);
    updateFilterUrl('status', normalizedStatus);
  }

  function updateEmployeeFilter(nextEmployeeId) {
    setEmployeeFilter(nextEmployeeId);
    setPage(0);
    updateFilterUrl('employee', nextEmployeeId);
  }

  function updateWorkType(nextWorkType) {
    const normalizedWorkType = ['task', 'checklist'].includes(nextWorkType) ? nextWorkType : 'all';
    setWorkType(normalizedWorkType);
    setPage(0);
    updateFilterUrl('workType', normalizedWorkType);
  }

  function updatePriorityFilter(nextPriority) {
    setPriority(nextPriority);
    setPage(0);
    updateFilterUrl('priority', nextPriority);
  }

  function updateFollowUpFilter(nextFollowUp) {
    const normalizedFollowUp = nextFollowUp === 'follow-up' ? 'follow-up' : 'all';
    setFollowUpFilter(normalizedFollowUp);
    updateFilterUrl('followUp', normalizedFollowUp === 'follow-up' ? '1' : 'all');
  }

  function updateDateFilter(nextDate) {
    const normalizedDate = isValidDateFilter(nextDate) ? nextDate : '';
    setDateFilter(normalizedDate);
    setPage(0);
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
    setWorkType('all');
    setPriority('all');
    setFollowUpFilter('all');
    setStatus('all');
    setDateFilter('');
    setPage(0);
    const params = new URLSearchParams(window.location.search);
    params.delete('employee');
    params.delete('workType');
    params.delete('status');
    params.delete('priority');
    params.delete('followUp');
    params.delete('date');
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }

  return <AppShell title="Tasks" eyebrow="Workspace / Tasks" description="Create, prioritize, and keep every assignment moving." actions={canCreate ? <button className="button button-primary" type="button" onClick={openCreateModal}><Icon name="plus" size={17} />Create task</button> : null}>
    {taskData && !canCreate && <section className="task-summary-row"><div className="inline-stat"><span className="inline-stat-icon blue"><Icon name="clipboard" size={16} /></span><div><strong>{workSummary.total}</strong><span>Total tasks</span></div></div><div className="inline-stat"><span className="inline-stat-icon orange"><Icon name="warning" size={16} /></span><div><strong>{workSummary.overdue}</strong><span>Overdue</span></div></div><div className="inline-stat"><span className="inline-stat-icon purple"><Icon name="clock" size={16} /></span><div><strong>{workSummary.pending}</strong><span>Pending</span></div></div><div className="inline-stat"><span className="inline-stat-icon mint"><Icon name="checkCircle" size={16} /></span><div><strong>{workSummary.completed}</strong><span>Completed</span></div></div></section>}
    {message && <div className="inline-alert success"><Icon name="checkCircle" size={16} />{message}</div>}
    {error && loadedRef.current && <div className="inline-alert error" role="alert"><Icon name="warning" size={16} />{error}<button className="button button-ghost button-small" type="button" onClick={retryLoad}>Try again</button></div>}
    <section className="panel task-panel">
      <SectionHeader eyebrow="Task inbox" title="All work" description="Search and filter tasks by urgency, owner, or workflow stage." />
      <div className="filter-bar">
        <label className="search-box"><Icon name="search" size={17} /><input aria-label="Search tasks" placeholder="Search tasks, people, or categories" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        {canCreate && <label className="filter-control"><span>Employee</span><select value={employeeFilter} onChange={(event) => updateEmployeeFilter(event.target.value)} disabled={!taskData}><option value="all">All employees</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></label>}
        <div className="filter-control work-type-control"><span id="work-type-label">Work type</span><div className="work-type-toggle" role="group" aria-labelledby="work-type-label">
          <button type="button" className={workType === 'all' ? 'active' : ''} aria-pressed={workType === 'all'} onClick={() => updateWorkType('all')} disabled={!taskData}>All work</button>
          <button type="button" className={workType === 'checklist' ? 'active' : ''} aria-pressed={workType === 'checklist'} onClick={() => updateWorkType('checklist')} disabled={!taskData}>Checklist</button>
          <button type="button" className={workType === 'task' ? 'active' : ''} aria-pressed={workType === 'task'} onClick={() => updateWorkType('task')} disabled={!taskData}>Task</button>
        </div></div>
        <label className="filter-control"><span>Date</span><input type="date" value={dateFilter} onChange={(event) => updateDateFilter(event.target.value)} disabled={!taskData} /></label>
        <label className="filter-control"><span>Status</span><select value={status} onChange={(event) => updateStatusFilter(event.target.value)} disabled={!taskData}><option value="all">All status</option><option value="pending">Pending</option><option value="overdue">Overdue</option><option value="completed">Completed</option></select></label>
        <label className="filter-control"><span>Follow-up</span><select value={followUpFilter} onChange={(event) => updateFollowUpFilter(event.target.value)} disabled={!taskData}><option value="all">All work</option><option value="follow-up">Follow-up tasks</option></select></label>
        <label className="filter-control"><span>Priority</span><select value={priority} onChange={(event) => updatePriorityFilter(event.target.value)} disabled={!taskData}><option value="all">All priorities</option><option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option></select></label>
        <button className="button button-ghost button-small filter-button" type="button" onClick={clearFilters} disabled={!taskData}><Icon name="filter" size={15} />Clear</button>
      </div>
      {refreshing && <div className="task-refreshing" role="status">Updating results…</div>}
      {!loadedRef.current ? (error ? <div className="data-error-state"><Icon name="warning" size={20} /><strong>Tasks could not be loaded.</strong><span>{error}</span><button className="button button-primary button-small" type="button" onClick={retryLoad}>Try again</button></div> : <Loader label="Loading tasks..." />) : workItems.length ? <>
        <div className="task-list task-list-desktop">{workItems.map((workItem) => { const workStatus = getWorkItemStatus(workItem); const href = getWorkLink(workItem); const canComplete = workItem.kind === 'checklist' && canCompleteChecklist(taskData.role, taskData.employeeId, workItem.employee_id) && workStatus !== 'completed'; const canDelete = canCreate && workItem.kind !== 'checklist'; return <div className="task-row task-row-grid" key={`${workItem.kind}-${workItem.id}`}><div className="task-row-main">{canComplete ? <button className="task-check task-check-button" type="button" onClick={() => completeChecklist(workItem)} disabled={completing === workItem.id} aria-label={`Complete ${workItem.title}`}><Icon name="checkSquare" size={18} /></button> : <span className="task-check"><Icon name={workStatus === 'completed' ? 'checkCircle' : workItem.kind === 'checklist' ? 'checkSquare' : 'clipboard'} size={18} /></span>}<div className="task-copy"><TaskTextTooltip text={workItem.title} className="task-title-tooltip"><Link href={href} className="task-title">{workItem.title}</Link></TaskTextTooltip><div className="task-subline"><span className={workItem.kind === 'checklist' ? 'task-source-badge' : ''}>{workItem.kind === 'checklist' && <Icon name="checkSquare" size={11} />} {workItem.kind === 'checklist' ? 'Checklist' : workItem.category || 'General'}</span><span className="dot-separator" /><span>{workItem.description || 'No description added'}</span></div></div></div><div className="task-owner"><span className="avatar avatar-xs">{(workItem.assignee?.name || 'U').slice(0, 1).toUpperCase()}</span>{workItem.assignee?.name || 'Unassigned'}</div><PriorityBadge priority={workItem.priority} /><StatusBadge status={workStatus} compact /><span className={workStatus === 'overdue' ? 'due-date overdue' : 'due-date'}><Icon name="calendar" size={14} />{getWorkDeadline(workItem)}</span><div className="task-row-actions"><Link className="row-action" href={href} aria-label={`Open ${workItem.title}`}><Icon name="chevronRight" size={17} /></Link>{canDelete && <button className="row-action row-action-delete" type="button" onClick={() => deleteTask(workItem)} disabled={deletingTaskId === workItem.id} aria-label={`Delete ${workItem.title}`}>{deletingTaskId === workItem.id ? '…' : <Icon name="close" size={17} />}</button>}</div></div>; })}</div>
        <div className="task-list task-list-mobile">{workItems.map((workItem) => { const workStatus = getWorkItemStatus(workItem); const href = getWorkLink(workItem); const canDelete = canCreate && workItem.kind !== 'checklist'; return <div className="mobile-task-card" key={`${workItem.kind}-${workItem.id}`}><div className="mobile-task-card-top"><TaskTextTooltip text={workItem.title} className="task-title-tooltip"><Link href={href} className="task-title">{workItem.title}</Link></TaskTextTooltip><StatusBadge status={workStatus} compact /></div><div className="mobile-task-card-meta"><span>{workItem.assignee?.name || 'Unassigned'}</span><PriorityBadge priority={workItem.priority} /><span className={workStatus === 'overdue' ? 'overdue' : ''}><Icon name="calendar" size={13} />{getWorkDeadline(workItem)}</span></div><p>{workItem.description || 'No description added'}</p><div className="mobile-task-card-footer"><span>{workItem.kind === 'checklist' ? 'Checklist' : workItem.category || 'General'}</span>{canDelete && <button className="button button-ghost button-small" type="button" onClick={() => deleteTask(workItem)} disabled={deletingTaskId === workItem.id}>{deletingTaskId === workItem.id ? 'Deleting...' : 'Delete task'}</button>}</div></div>; })}</div>
        <div className="task-pagination" aria-label="Task pagination"><span>{total} result{total === 1 ? '' : 's'} · Page {page + 1} of {totalPages}</span><div><button className="button button-ghost button-small" type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0 || refreshing}>Previous</button><button className="button button-ghost button-small" type="button" onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))} disabled={page + 1 >= totalPages || refreshing}>Next</button></div></div>
      </> : <EmptyState icon="clipboard" title="No tasks match these filters" description="Try a different search or clear the filters to see more work." action={canCreate ? 'Create a task' : null} onAction={canCreate ? openCreateModal : undefined} />}
    </section>
    {canCreate && <Modal open={modalOpen} title="Create a task" description="Give one person a clear next step with enough context to finish well." onClose={() => setModalOpen(false)} wide><form className="modal-form" onSubmit={submit}><div className="form-grid form-grid-two"><div className="field field-wide"><label htmlFor="task-title">Task title<span>*</span></label><input id="task-title" className="input" required placeholder="e.g. Prepare weekly sales summary" value={form.title} onChange={(event) => updateForm('title', event.target.value)} /></div><div className="field"><label htmlFor="task-assignee">Assign to<span>*</span></label><select id="task-assignee" className="input" required value={form.assignee_id} onChange={(event) => updateForm('assignee_id', event.target.value)}><option value="">Choose a person</option>{(taskData?.role && employees.filter((employee) => employee.role !== 'super_admin' && employee.role !== 'assigner' && employee.role !== 'ea')).map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></div><div className="field"><label htmlFor="task-priority">Priority</label><select id="task-priority" className="input" value={form.priority} onChange={(event) => updateForm('priority', event.target.value)}><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div><div className="field"><label htmlFor="task-due">Due date<span>*</span></label><input id="task-due" className="input" type="date" required value={form.eta} onChange={(event) => updateForm('eta', event.target.value)} /></div><div className="field"><label htmlFor="task-due-time">Due time<span>*</span></label><input id="task-due-time" className="input" type="time" required value={form.due_time} onChange={(event) => updateForm('due_time', event.target.value)} /></div><div className="field"><label htmlFor="task-start">Start date</label><input id="task-start" className="input" type="date" value={form.start_date} onChange={(event) => updateForm('start_date', event.target.value)} /></div><div className="field field-wide"><label htmlFor="task-description">Description</label><textarea id="task-description" className="input" rows="4" placeholder="What does done look like?" value={form.description} onChange={(event) => updateForm('description', event.target.value)} /></div><div className="field field-wide"><label htmlFor="task-instructions">Instructions or handoff notes</label><textarea id="task-instructions" className="input" rows="3" placeholder="Add links, context, or specific expectations." value={form.instructions} onChange={(event) => updateForm('instructions', event.target.value)} /></div><label className="checkbox-field field-wide"><input type="checkbox" checked={form.proof_required} onChange={(event) => updateForm('proof_required', event.target.checked)} /><span><strong>Ask for completion proof</strong><small>Keep the handoff auditable when the task is submitted.</small></span></label></div>{error && <div className="form-error"><Icon name="warning" size={16} />{error}</div>}<div className="modal-actions"><button className="button button-ghost" type="button" onClick={() => setModalOpen(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create task'}{!saving && <Icon name="arrowUpRight" size={16} />}</button></div></form></Modal>}
  </AppShell>;
}
