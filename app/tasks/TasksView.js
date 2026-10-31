'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { Modal } from '../../components/UI';
import { ClearFiltersButton, FilterDate, FilterSelect, InlineError, Kbd, ListEmpty, ListGroup, StatStrip, Surface, Toolbar, ToolbarSearch } from '../../components/Workflow';
import { markWorkItemCompleted, workStatusGroups, WorkColumnsHeader, WorkItemRow } from '../../components/WorkList';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { canCreateTasks, getAccessToken, getCurrentEmployee, peekCurrentEmployee } from '../../lib/auth';
import { peekQuery, queryKey, setQuery } from '../../lib/query-cache';
import { canCompleteChecklist, setChecklistCompletion } from '../../lib/checklist-data';
import { canCompleteTask, createTask, setTaskCompletion } from '../../lib/task-data';
import { getWorkItemStatus } from '../../lib/work-data';
import { getPageCount } from '../../lib/work-list.mjs';
import { isFreshRender, isValidDateFilter, loadTasksPage, loadTasksWorkspace, parseTaskFilters, SECTION_PAGE_SIZE, taskSectionStatuses } from '../../lib/page-data';
import { Spinner } from '../../components/Loader';
import { ProofDialog, ProofPrompt } from '../../components/TaskProof';
import { isProofRequiredError } from '../../lib/task-proofs';

const emptyForm = { title: '', description: '', assignee_id: '', eta: '', due_time: '', start_date: '', priority: 'normal', category: 'General', instructions: '', proof_required: null, completion_notes: null, attachments: [] };
const viewTabs = [['all', 'All work'], ['task', 'Tasks'], ['checklist', 'Checklist']];

function getLocalDateInputValue() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function seedTaskCache(initialData) {
  // Never let an older server payload overwrite data this tab has already refreshed.
  if (!isFreshRender(initialData)) return;
  setQuery(queryKey('tasks-workspace', initialData.workspace.employeeId), initialData.workspace);
}

const emptySection = { workItems: [], total: 0, page: 0, loaded: false, loading: false, error: '' };
const initialSections = (initial) => Object.fromEntries(taskSectionStatuses.map((status) => [status, initial?.[status] ? { ...emptySection, ...initial[status], loaded: true } : emptySection]));

export default function TasksView({ initialData }) {
  const searchParams = useSearchParams();
  const initialFilters = initialData?.filters;
  const [taskData, setTaskData] = useState(() => (initialData ? initialData.workspace : peekQuery(queryKey('tasks-workspace', peekCurrentEmployee()?.employee?.id)) || null));
  const [form, setForm] = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState(initialFilters?.employee || 'all');
  const [workType, setWorkType] = useState(initialFilters?.workType || 'all');
  const [status, setStatus] = useState(initialFilters?.status || 'all');
  const [priority, setPriority] = useState(initialFilters?.priority || 'all');
  const [followUpFilter, setFollowUpFilter] = useState(initialFilters?.followUp || 'all');
  const [dateFilter, setDateFilter] = useState(initialFilters?.date || '');
  const [filtersReady, setFiltersReady] = useState(Boolean(initialData));
  const [sections, setSections] = useState(() => initialSections(initialData?.sections));
  const [workspaceReload, setWorkspaceReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(null);
  const [justCompleted, setJustCompleted] = useState(null);
  const [proofTarget, setProofTarget] = useState(null);
  const [requiredProof, setRequiredProof] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const requestIdsRef = useRef({});
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  // The server already rendered page one for the URL's filters; skip refetching it on mount.
  const skipFirstLoadRef = useRef(Boolean(initialData));

  useEffect(() => {
    seedTaskCache(initialData);
    function syncFiltersFromUrl() {
      const filters = parseTaskFilters(new URLSearchParams(window.location.search));
      setEmployeeFilter(filters.employee);
      setWorkType(filters.workType);
      setStatus(filters.status);
      setPriority(filters.priority);
      setFollowUpFilter(filters.followUp);
      setDateFilter(filters.date);
    }
    if (!initialData) syncFiltersFromUrl();
    setFiltersReady(true);
    window.addEventListener('popstate', syncFiltersFromUrl);
    return () => window.removeEventListener('popstate', syncFiltersFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreateModal() {
    setForm({ ...emptyForm, start_date: getLocalDateInputValue() });
    setModalOpen(true);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (initialData && workspaceReload === 0) return undefined;
    let active = true;
    async function loadWorkspace() {
      setError('');
      const { user, employee, error: employeeError } = await getCurrentEmployee();
      if (!active || !user) return;
      if (employeeError || !employee) {
        setError('Unable to load your workspace profile. Please try again.');
        return;
      }
      const response = await loadTasksWorkspace({ employee });
      if (!active) return;
      if (response.error) {
        setError(response.error.message || 'Unable to load employees. Please try again.');
        return;
      }
      setQuery(queryKey('tasks-workspace', employee.id), response.data);
      setTaskData((current) => ({ ...current, ...response.data }));
    }
    loadWorkspace();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceReload]);

  const taskRole = taskData?.role;
  const taskEmployeeId = taskData?.employeeId;

  const visibleStatuses = status === 'all' ? taskSectionStatuses : [status];

  // One request per status section; each keeps its own page so long lists stay small.
  const loadSection = useCallback(async (sectionStatus, nextPage, { silent = false } = {}) => {
    if (!taskRole || !taskEmployeeId) return;
    const requestId = (requestIdsRef.current[sectionStatus] || 0) + 1;
    requestIdsRef.current[sectionStatus] = requestId;
    setSections((current) => ({ ...current, [sectionStatus]: { ...current[sectionStatus], page: nextPage, loading: !silent, error: '' } }));
    const filters = { employee: employeeFilter, workType, status: sectionStatus, priority, date: dateFilter, followUp: followUpFilter };
    const response = await loadTasksPage({ role: taskRole, employeeId: taskEmployeeId, filters, page: nextPage, pageSize: SECTION_PAGE_SIZE, withSummary: false, search: debouncedSearch });
    if (requestId !== requestIdsRef.current[sectionStatus]) return;
    // The last item of a later page was removed: step back to the new last page.
    if (!response.error && nextPage > 0 && !response.data.workItems.length && response.data.total > 0) return loadSection(sectionStatus, getPageCount(response.data.total, SECTION_PAGE_SIZE) - 1, { silent });
    setSections((current) => ({ ...current, [sectionStatus]: response.error
      ? { ...current[sectionStatus], loading: false, error: response.error.message || 'Unable to load tasks. Please try again.' }
      : { workItems: response.data.workItems, total: response.data.total ?? response.data.workItems.length, page: nextPage, loaded: true, loading: false, error: '' } }));
  }, [dateFilter, debouncedSearch, employeeFilter, followUpFilter, priority, taskEmployeeId, taskRole, workType]);

  // After a change, refresh every visible section on the page the user is looking at.
  function load() {
    visibleStatuses.forEach((sectionStatus) => loadSection(sectionStatus, sectionsRef.current[sectionStatus].page, { silent: true }));
  }

  // Filters (or a mutation) restart every visible section from its first page.
  useEffect(() => {
    if (!filtersReady || !taskRole || !taskEmployeeId) return;
    if (skipFirstLoadRef.current) {
      skipFirstLoadRef.current = false;
      if (isFreshRender(initialData)) return;
    }
    visibleStatuses.forEach((sectionStatus) => loadSection(sectionStatus, 0, { silent: sectionsRef.current[sectionStatus].loaded }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersReady, loadSection, status, taskRole]);

  function retryLoad() {
    if (taskData) load();
    else setWorkspaceReload((value) => value + 1);
  }

  // "Create task" from the sidebar, command menu or the C shortcut lands here as ?create=1.
  const createRequested = searchParams.get('create') === '1';
  useEffect(() => {
    if (!createRequested || !taskData) return;
    openCreateModal();
    const params = new URLSearchParams(window.location.search);
    params.delete('create');
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [createRequested, taskData]);

  const employees = useMemo(() => taskData?.employees || [], [taskData]);
  const canCreate = Boolean(taskData && canCreateTasks(taskData.role));
  const personal = Boolean(taskData) && !canCreate;
  const sectionList = visibleStatuses.map((sectionStatus) => ({ ...workStatusGroups.find((group) => group.status === sectionStatus), ...sections[sectionStatus] }));
  const anyLoading = sectionList.some((section) => section.loading);
  const allLoaded = sectionList.every((section) => section.loaded);
  const grandTotal = sectionList.reduce((sum, section) => sum + section.total, 0);
  const sectionError = sectionList.find((section) => section.error)?.error || '';
  const filtersActive = Boolean(search.trim() || employeeFilter !== 'all' || status !== 'all' || priority !== 'all' || followUpFilter !== 'all' || dateFilter);

  function updateForm(field, value) { setForm((current) => ({ ...current, [field]: value })); }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    if (!form.due_time) { setError('Please select a due time.'); setSaving(false); return; }
    const { user, employee } = await getCurrentEmployee();
    if (!user) { setError('Your session has expired. Please sign in again.'); setSaving(false); return; }
    const own = !canCreateTasks(employee?.role);
    if (!own && typeof form.proof_required !== 'boolean') { setError('Choose whether completion proof is mandatory or optional.'); setSaving(false); return; }
    const { error: createError } = await createTask(own ? { ...form, assignee_id: employee.id, proof_required: false } : form, user.id);
    if (createError) setError(createError.message);
    else { setForm(emptyForm); setModalOpen(false); setMessage(own ? 'Task added to your list.' : 'Task created and assigned.'); load({ background: true }); }
    setSaving(false);
  }

  function patchWorkItems(update) {
    setSections((current) => Object.fromEntries(Object.entries(current).map(([key, section]) => [key, { ...section, workItems: update(section.workItems) }])));
  }

  async function completeWork(workItem) {
    if (completing || getWorkItemStatus(workItem) === 'completed') return;
    setCompleting(workItem.id);
    setError('');
    patchWorkItems((items) => items.map((item) => (item.kind === workItem.kind && item.id === workItem.id ? markWorkItemCompleted(item) : item)));
    const { error: updateError } = await (workItem.kind === 'checklist' ? setChecklistCompletion(workItem.id) : setTaskCompletion(workItem.id, true));
    if (updateError) { patchWorkItems((items) => items.map((item) => (item.kind === workItem.kind && item.id === workItem.id ? workItem : item))); if (workItem.kind === 'task' && isProofRequiredError(updateError)) { setJustCompleted(null); setRequiredProof({ kind: 'task', id: workItem.id, title: workItem.title }); } else setError(updateError.message); }
    else { setMessage(''); setJustCompleted({ kind: workItem.kind, id: workItem.id, title: workItem.title }); load({ background: true }); }
    setCompleting(null);
  }

  function proofAdded() {
    setProofTarget(null);
    setJustCompleted(null);
    setMessage('Proof screenshot added.');
  }

  async function deleteTask(workItem) {
    if (!canCreate || workItem.kind === 'checklist' || deletingTaskId) return;
    if (!window.confirm(`Permanently delete "${workItem.title}"? This also removes its updates and notifications. This cannot be undone.`)) return;
    setDeletingTaskId(workItem.id);
    setError('');
    setMessage('');
    patchWorkItems((items) => items.filter((item) => !(item.kind === 'task' && item.id === workItem.id)));
    const token = await getAccessToken();
    const response = await fetch('/api/tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ id: workItem.id }) });
    const payload = await response.json().catch(() => ({}));
    // Reload rather than restore a snapshot: filters or pages may have changed while the request ran.
    if (!response.ok) { setError(payload.error || 'The task could not be deleted.'); load({ background: true }); }
    else { setMessage('Task deleted.'); load({ background: true }); }
    setDeletingTaskId(null);
  }

  function updateFilterUrl(key, value) {
    const params = new URLSearchParams(window.location.search);
    if (!value || value === 'all') params.delete(key);
    else params.set(key, value);
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }

  function setFilter(setter, key, value, urlValue = value) {
    setter(value);
    updateFilterUrl(key, urlValue);
  }

  function clearFilters() {
    setSearch('');
    setEmployeeFilter('all');
    setPriority('all');
    setFollowUpFilter('all');
    setStatus('all');
    setDateFilter('');
    const params = new URLSearchParams(window.location.search);
    ['employee', 'status', 'priority', 'followUp', 'date'].forEach((key) => params.delete(key));
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }

  const rowMenu = (workItem) => canCreate && workItem.kind !== 'checklist' ? <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="size-8 text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 data-[state=open]:opacity-100" aria-label={`Actions for ${workItem.title}`}><Icon name="more" size={16} /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-40">
      <DropdownMenuItem variant="destructive" disabled={deletingTaskId === workItem.id} onSelect={() => deleteTask(workItem)}><Icon name="close" size={15} />Delete task</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu> : null;

  return <AppShell title="Tasks" description="Create, prioritize, and keep every assignment moving." actions={taskData ? <Button size="sm" className="h-8 gap-1.5 px-3" onClick={openCreateModal}><Icon name="plus" size={15} />{personal ? 'Add my task' : 'Create task'}<Kbd className="ml-1 hidden border-white/25 bg-white/15 text-white sm:inline-flex">C</Kbd></Button> : null}>
    {taskData && <StatStrip items={[
      { label: 'Total', value: allLoaded ? grandTotal : null, icon: 'clipboard' },
      ...taskSectionStatuses.map((sectionStatus) => ({ label: workStatusGroups.find((group) => group.status === sectionStatus).title, value: sections[sectionStatus].loaded && visibleStatuses.includes(sectionStatus) ? sections[sectionStatus].total : null, status: sectionStatus, tone: sectionStatus === 'overdue' ? 'danger' : undefined })),
    ]} />}
    <ProofPrompt target={justCompleted} onAdd={() => setProofTarget(justCompleted)} onDismiss={() => setJustCompleted(null)} />
    {message && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[14px] text-emerald-800" role="status"><Icon name="checkCircle" size={15} />{message}<button type="button" className="ml-auto text-emerald-700 hover:text-emerald-900" aria-label="Dismiss" onClick={() => setMessage('')}><Icon name="close" size={14} /></button></div>}
    <Surface>
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-2 py-2 sm:px-3" role="tablist" aria-label="Work type">
        {viewTabs.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={workType === value} disabled={!taskData} onClick={() => setFilter(setWorkType, 'workType', value)} className={cn('h-8 shrink-0 rounded-md px-3 text-[14px] font-medium transition-colors', workType === value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')}>{label}</button>)}
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 px-2 text-[13.5px] text-muted-foreground tabular-nums">{anyLoading ? <><Spinner />Updating…</> : allLoaded ? `${grandTotal} result${grandTotal === 1 ? '' : 's'}` : null}</span>
      </div>
      <Toolbar search={<ToolbarSearch value={search} onChange={setSearch} placeholder="Search tasks, people, or categories" label="Search tasks" />}>
        {canCreate && <FilterSelect label="Person" value={employeeFilter} onChange={(value) => setFilter(setEmployeeFilter, 'employee', value)} disabled={!taskData}><option value="all">Anyone</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</FilterSelect>}
        <FilterSelect label="Status" value={status} onChange={(value) => setFilter(setStatus, 'status', value)} disabled={!taskData}><option value="all">Any</option><option value="pending">Pending</option><option value="overdue">Overdue</option><option value="completed">Completed</option></FilterSelect>
        <FilterSelect label="Priority" value={priority} onChange={(value) => setFilter(setPriority, 'priority', value)} disabled={!taskData}><option value="all">Any</option><option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option></FilterSelect>
        <FilterDate label="Due" value={dateFilter} onChange={(value) => setFilter(setDateFilter, 'date', isValidDateFilter(value) ? value : '')} disabled={!taskData} />
        <FilterSelect label="Follow-up" value={followUpFilter} onChange={(value) => setFilter(setFollowUpFilter, 'followUp', value, value === 'follow-up' ? '1' : 'all')} disabled={!taskData}><option value="all">All</option><option value="follow-up">Only follow-ups</option></FilterSelect>
        <ClearFiltersButton visible={filtersActive} onClick={clearFilters} />
      </Toolbar>
      <InlineError message={error || sectionError} onRetry={retryLoad} />
      {allLoaded && !grandTotal
        ? <ListEmpty icon="clipboard" title="No work matches these filters" description="Try a different search or clear the filters to see more work." action={taskData ? <Button size="sm" onClick={openCreateModal}><Icon name="plus" size={15} />{personal ? 'Add my task' : 'Create a task'}</Button> : filtersActive ? <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : null} />
        : <>
          <WorkColumnsHeader showPerson={canCreate} hasActions={canCreate} />
          {sectionList.map((section) => <ListGroup key={`${section.status}-${status}`} status={section.status} title={section.title} count={section.loaded ? section.total : '–'} defaultOpen={status !== 'all'}>
            {!section.loaded ? <li className="flex items-center gap-2 px-4 py-4 text-[14px] text-muted-foreground"><Spinner />Loading…</li>
              : section.workItems.length ? section.workItems.map((workItem) => <WorkItemRow key={`${workItem.kind}-${workItem.id}`} workItem={workItem} showAssignee={canCreate} canComplete={workItem.kind === 'checklist' ? canCompleteChecklist(taskData.role, taskData.employeeId, workItem.employee_id) : canCompleteTask(taskData.employeeId, workItem.employee_id)} completing={completing} onComplete={completeWork} trailing={rowMenu(workItem)} />)
                : <li className="px-4 py-4 text-[14px] text-muted-foreground">Nothing {section.status} matches these filters.</li>}
            {section.total > SECTION_PAGE_SIZE && <li className="flex items-center justify-between gap-3 border-t border-border/70 bg-muted/20 px-4 py-2 text-[14px] text-muted-foreground" aria-label={`${section.title} pagination`}>
              <span className="tabular-nums">{section.page * SECTION_PAGE_SIZE + 1}–{Math.min(section.total, (section.page + 1) * SECTION_PAGE_SIZE)} of {section.total}</span>
              <span className="flex items-center gap-1.5">{section.loading && <Spinner />}<Button variant="outline" size="sm" className="h-8" onClick={() => loadSection(section.status, section.page - 1)} disabled={section.page === 0 || section.loading}>Previous</Button><Button variant="outline" size="sm" className="h-8" onClick={() => loadSection(section.status, section.page + 1)} disabled={(section.page + 1) * SECTION_PAGE_SIZE >= section.total || section.loading}>Next</Button></span>
            </li>}
          </ListGroup>)}
        </>}
    </Surface>
    {taskData && <Modal open={modalOpen} title={personal ? 'Add my task' : 'Create a task'} description={personal ? 'Plan your own work for the day. It shows up in your list and on your dashboard.' : 'Give one person a clear next step with enough context to finish well.'} onClose={() => setModalOpen(false)} wide><form className="modal-form" onSubmit={submit}><div className="form-grid form-grid-two"><div className="field field-wide"><label htmlFor="task-title">Task title<span>*</span></label><input id="task-title" className="input" required placeholder="e.g. Prepare weekly sales summary" value={form.title} onChange={(event) => updateForm('title', event.target.value)} /></div>{!personal && <div className="field"><label htmlFor="task-assignee">Assign to<span>*</span></label><select id="task-assignee" className="input" required value={form.assignee_id} onChange={(event) => updateForm('assignee_id', event.target.value)}><option value="">Choose a person</option>{(taskData?.role && employees.filter((employee) => employee.role !== 'super_admin' && employee.role !== 'assigner' && employee.role !== 'ea')).map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></div>}<div className="field"><label htmlFor="task-priority">Priority</label><select id="task-priority" className="input" value={form.priority} onChange={(event) => updateForm('priority', event.target.value)}><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div><div className="field"><label htmlFor="task-due">Due date<span>*</span></label><input id="task-due" className="input" type="date" required value={form.eta} onChange={(event) => updateForm('eta', event.target.value)} /></div><div className="field"><label htmlFor="task-due-time">Due time<span>*</span></label><input id="task-due-time" className="input" type="time" required value={form.due_time} onChange={(event) => updateForm('due_time', event.target.value)} /></div><div className="field"><label htmlFor="task-start">Start date</label><input id="task-start" className="input" type="date" value={form.start_date} onChange={(event) => updateForm('start_date', event.target.value)} /></div><div className="field field-wide"><label htmlFor="task-description">Description</label><textarea id="task-description" className="input" rows="4" placeholder="What does done look like?" value={form.description} onChange={(event) => updateForm('description', event.target.value)} /></div>{!personal && <><div className="field field-wide"><label htmlFor="task-instructions">Instructions or handoff notes</label><textarea id="task-instructions" className="input" rows="3" placeholder="Add links, context, or specific expectations." value={form.instructions} onChange={(event) => updateForm('instructions', event.target.value)} /></div><fieldset className="field field-wide"><legend className="mb-1.5 text-[14px] font-medium">Completion proof<span className="text-destructive">*</span></legend><div className="grid gap-2 sm:grid-cols-2">{[[true, 'Mandatory', 'A screenshot must be added before the task can be completed.'], [false, 'Optional', 'The assignee can add a screenshot, or complete without one.']].map(([value, label, hint]) => <label key={label} className={cn('flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 hover:border-brand/50', form.proof_required === value && 'border-brand bg-brand/5 ring-2 ring-brand/15')}><input type="radio" name="task-proof" className="mt-1" checked={form.proof_required === value} onChange={() => updateForm('proof_required', value)} /><span><strong className="block text-[14px]">{label}</strong><small className="text-[13px] text-muted-foreground">{hint}</small></span></label>)}</div></fieldset></>}</div>{error && <div className="form-error"><Icon name="warning" size={16} />{error}</div>}<div className="modal-actions"><button className="button button-ghost" type="button" onClick={() => setModalOpen(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? <><Spinner />Creating...</> : 'Create task'}{!saving && <Icon name="arrowUpRight" size={16} />}</button></div></form></Modal>}
    <ProofDialog target={proofTarget} mode="attach" onClose={() => setProofTarget(null)} onDone={proofAdded} />
    <ProofDialog target={requiredProof} mode="complete" required onClose={() => setRequiredProof(null)} onDone={() => { setRequiredProof(null); setMessage('Proof uploaded and task completed.'); load({ background: true }); }} />
  </AppShell>;
}
