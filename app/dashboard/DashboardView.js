'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { ClearFiltersButton, FilterSelect, InlineError, ListEmpty, ListGroup, ListSkeleton, StatStrip, Surface, SurfaceHeader, Toolbar, ToolbarSearch } from '../../components/Workflow';
import { markWorkItemCompleted, WorkColumnsHeader, WorkItemRow } from '../../components/WorkList';
import { Button } from '@/components/ui/button';
import { getCurrentEmployee, peekCurrentEmployee } from '../../lib/auth';
import { canCompleteChecklist, setChecklistCompletion } from '../../lib/checklist-data';
import { peekQuery, queryKey, setQuery } from '../../lib/query-cache';
import { isFreshRender, loadDashboardData } from '../../lib/page-data';
import { canCompleteTask, setTaskCompletion } from '../../lib/task-data';
import { getWorkItemStatus, sortWorkItemsChronologically } from '../../lib/work-data';
import { ProofDialog, ProofPrompt } from '../../components/TaskProof';
import { isProofRequiredError } from '../../lib/task-proofs';

const DASHBOARD_PAGE = 20;

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardView({ initialData }) {
  const [data, setData] = useState(() => initialData || peekQuery(queryKey('dashboard', peekCurrentEmployee()?.employee?.id)) || null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [completing, setCompleting] = useState(null);
  const [justCompleted, setJustCompleted] = useState(null);
  const [proofTarget, setProofTarget] = useState(null);
  const [requiredProof, setRequiredProof] = useState(null);
  const [visibleCount, setVisibleCount] = useState({ overdue: DASHBOARD_PAGE, pending: DASHBOARD_PAGE, completed: DASHBOARD_PAGE });
  const abortRef = useRef(null);

  async function load() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    const { employee, error: employeeError } = await getCurrentEmployee();
    if (controller.signal.aborted) return;
    if (employeeError || !employee) { setError('Unable to load your workspace profile. Please try again.'); setLoading(false); return; }
    const response = await loadDashboardData({ employee, signal: controller.signal });
    if (controller.signal.aborted) return;
    if (response.error) setError(response.error.message || 'Unable to load dashboard data. Please try again.');
    else { setQuery(queryKey('dashboard', employee.id), response.data); setData(response.data); }
    setLoading(false);
  }

  useEffect(() => {
    // Server-rendered data is fresh; only fetch when the page arrived without it.
    if (initialData) setQuery(queryKey('dashboard', initialData.employeeId), initialData);
    if (!isFreshRender(initialData)) load();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const manager = Boolean(data && ['super_admin', 'assigner', 'ea'].includes(data.role));

  const metrics = data?.metrics || {};
  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visible = (items) => sortWorkItemsChronologically((items || []).filter((task) => {
      const searchable = [task.title, task.description, task.assignee?.name, task.assignee?.email, task.category].filter(Boolean).join(' ').toLowerCase();
      return (!query || searchable.includes(query))
        && (employeeFilter === 'all' || task.assignee_id === employeeFilter)
        && (typeFilter === 'all' || task.kind === typeFilter)
        && (priorityFilter === 'all' || (task.priority || 'normal') === priorityFilter);
    }));
    const today = { overdue: [], pending: [], completed: [] };
    visible(data?.todayItems).forEach((task) => today[getWorkItemStatus(task)]?.push(task));
    return today;
  }, [data, employeeFilter, priorityFilter, search, typeFilter]);
  const filtersActive = Boolean(search.trim() || employeeFilter !== 'all' || typeFilter !== 'all' || priorityFilter !== 'all');

  function clearFilters() { setSearch(''); setEmployeeFilter('all'); setTypeFilter('all'); setPriorityFilter('all'); }

  async function completeChecklist(workItem) {
    if (completing) return;
    setCompleting(workItem.id);
    setError('');
    const swap = (replacement) => (item) => (item.kind === workItem.kind && item.id === workItem.id ? replacement(item) : item);
    const mapGroups = (replacement) => setData((current) => ({ ...current, todayItems: current.todayItems.map(swap(replacement)) }));
    mapGroups(markWorkItemCompleted);
    const { error: updateError } = await (workItem.kind === 'checklist' ? setChecklistCompletion(workItem.id) : setTaskCompletion(workItem.id, true));
    // Revert just this row so a refresh that landed meanwhile is not thrown away.
    if (updateError) { mapGroups(() => workItem); if (workItem.kind === 'task' && isProofRequiredError(updateError)) { setJustCompleted(null); setRequiredProof({ kind: 'task', id: workItem.id, title: workItem.title }); } else setError(updateError.message); }
    else setJustCompleted({ kind: workItem.kind, id: workItem.id, title: workItem.title });
    setCompleting(null);
    if (!updateError) load();
  }

  const renderRow = (task) => <WorkItemRow key={`${task.kind}-${task.id}`} workItem={task} showAssignee={manager} canComplete={task.kind === 'checklist' ? canCompleteChecklist(data.role, data.employeeId, task.assignee_id) : canCompleteTask(data.employeeId, task.assignee_id)} completing={completing} onComplete={completeChecklist} />;

  return <AppShell
    title={data ? (manager ? 'Dashboard' : 'My work') : 'Dashboard'}
    description={data ? <span suppressHydrationWarning>{greeting()}, {data.name}. Here is your work for today.</span> : 'Loading your workspace…'}
    actions={data ? <Button asChild size="sm" className="h-8 gap-1.5 px-3"><Link href="/tasks?create=1"><Icon name="plus" size={15} />{manager ? 'Create task' : 'Add my task'}</Link></Button> : null}>
    <StatStrip items={[
      { label: 'Total', value: data ? metrics.total : null, icon: 'clipboard', href: '/tasks' },
      { label: 'Pending', value: data ? metrics.pending : null, status: 'pending', href: '/tasks?status=pending' },
      { label: 'Overdue', value: data ? metrics.overdue : null, status: 'overdue', tone: 'danger', href: '/tasks?status=overdue' },
      { label: 'Completed', value: data ? metrics.completed : null, status: 'completed', href: '/tasks?status=completed' },
    ]} />
    <ProofPrompt target={justCompleted} onAdd={() => setProofTarget(justCompleted)} onDismiss={() => setJustCompleted(null)} />
    <Surface>
      <SurfaceHeader title="Today" description="Everything due today, grouped by status." actions={<>
        <Button asChild variant="outline" size="sm" className="h-8"><Link href="/follow-up-tasks"><Icon name="calendar" size={14} />Follow-ups</Link></Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-brand"><Link href="/tasks">All work<Icon name="arrowUpRight" size={14} /></Link></Button>
      </>} />
      <Toolbar search={manager ? <ToolbarSearch value={search} onChange={setSearch} placeholder="Search today's work or people" /> : null}>
        {manager && <FilterSelect label="Person" value={employeeFilter} onChange={setEmployeeFilter}><option value="all">Anyone</option>{(data?.employees || []).map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</FilterSelect>}
        <FilterSelect label="Type" value={typeFilter} onChange={setTypeFilter}><option value="all">All work</option><option value="task">Tasks</option><option value="checklist">Checklist</option></FilterSelect>
        <FilterSelect label="Priority" value={priorityFilter} onChange={setPriorityFilter}><option value="all">Any</option><option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option></FilterSelect>
        <ClearFiltersButton visible={filtersActive} onClick={clearFilters} />
      </Toolbar>
      <InlineError message={error} onRetry={load} />
      {!data && loading ? <ListSkeleton /> : <>
        <WorkColumnsHeader showPerson={manager} />
        {[['overdue', 'Overdue', true], ['pending', 'Pending', false], ['completed', 'Completed', false]].map(([status, title, open]) => groups[status].length > 0 && <ListGroup key={status} status={status} title={title} count={groups[status].length} defaultOpen={open}>{groups[status].slice(0, visibleCount[status]).map(renderRow)}{groups[status].length > visibleCount[status] && <li className="flex items-center justify-between gap-3 border-t border-border/70 bg-muted/20 px-4 py-2 text-[14px] text-muted-foreground"><span className="tabular-nums">Showing {visibleCount[status]} of {groups[status].length}</span><Button variant="outline" size="sm" className="h-8" onClick={() => setVisibleCount((current) => ({ ...current, [status]: current[status] + DASHBOARD_PAGE }))}>Show {Math.min(DASHBOARD_PAGE, groups[status].length - visibleCount[status])} more</Button></li>}</ListGroup>)}
        {data && !groups.overdue.length && !groups.pending.length && !groups.completed.length && <ListEmpty title={filtersActive ? 'Nothing matches these filters' : 'Nothing scheduled for today'} description={filtersActive ? 'Try a different search or clear the filters.' : 'Work due today will show up here.'} action={filtersActive ? <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : null} />}
      </>}
    </Surface>
    <ProofDialog target={proofTarget} mode="attach" onClose={() => setProofTarget(null)} onDone={() => { setProofTarget(null); setJustCompleted(null); }} />
    <ProofDialog target={requiredProof} mode="complete" required onClose={() => setRequiredProof(null)} onDone={() => { setRequiredProof(null); load(); }} />
  </AppShell>;
}
