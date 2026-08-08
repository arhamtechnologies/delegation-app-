'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { EmptyState, Modal, PriorityBadge, SectionHeader, StatusBadge, TaskRow, formatDate, formatDateTime } from '../../components/UI';
import { createTask, getTasks, taskIsOverdue, updateTaskStatus } from '../../lib/task-data';
import { supabaseBrowser } from '../../lib/supabase-browser';

const emptyForm = { title: '', description: '', assignee_id: '', eta: '', priority: 'normal', category: 'General', instructions: '', proof_required: true };

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const [{ data: taskRows = [] } = {}, { data: employeeRows = [] } = {}] = await Promise.all([
      getTasks({ limit: 200 }),
      supabaseBrowser().from('employees').select('id,name,active').eq('active', true).order('name'),
    ]);
    setTasks(taskRows || []);
    setEmployees(employeeRows || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [task.title, task.description, task.assignee?.name, task.category].filter(Boolean).join(' ').toLowerCase().includes(query);
    const matchesStatus = status === 'all' || (status === 'overdue' ? taskIsOverdue(task) : task.status === status);
    const matchesPriority = priority === 'all' || task.priority === priority;
    return matchesSearch && matchesStatus && matchesPriority;
  }), [tasks, search, status, priority]);

  function updateForm(field, value) { setForm((current) => ({ ...current, [field]: value })); }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    const { data: { user } = {} } = await supabaseBrowser().auth.getUser();
    if (!user) { setError('Your session has expired. Please sign in again.'); setSaving(false); return; }
    const { error: createError } = await createTask(form, user.id);
    if (createError) setError(createError.message);
    else { setForm(emptyForm); setModalOpen(false); setMessage('Task created and assigned.'); await load(); }
    setSaving(false);
  }

  async function changeStatus(id, nextStatus) {
    await updateTaskStatus(id, nextStatus);
    await load();
  }

  return <AppShell title="Tasks" eyebrow="Workspace / Tasks" description="Create, prioritize, and keep every assignment moving." actions={<button className="button button-primary" type="button" onClick={() => setModalOpen(true)}><Icon name="plus" size={17} />Create task</button>}>
    <section className="task-summary-row"><div className="inline-stat"><span className="inline-stat-icon blue"><Icon name="clipboard" size={16} /></span><div><strong>{tasks.length}</strong><span>Total tasks</span></div></div><div className="inline-stat"><span className="inline-stat-icon orange"><Icon name="warning" size={16} /></span><div><strong>{tasks.filter(taskIsOverdue).length}</strong><span>Overdue</span></div></div><div className="inline-stat"><span className="inline-stat-icon purple"><Icon name="message" size={16} /></span><div><strong>{tasks.filter((task) => task.status === 'submitted').length}</strong><span>In review</span></div></div><div className="inline-stat"><span className="inline-stat-icon mint"><Icon name="checkCircle" size={16} /></span><div><strong>{tasks.filter((task) => task.status === 'closed').length}</strong><span>Completed</span></div></div></section>
    {message && <div className="inline-alert success"><Icon name="checkCircle" size={16} />{message}</div>}
    <section className="panel task-panel"><SectionHeader eyebrow="Task inbox" title="All work" description="Search and filter tasks by urgency, owner, or workflow stage." /><div className="filter-bar"><label className="search-box"><Icon name="search" size={17} /><input aria-label="Search tasks" placeholder="Search tasks, people, or categories" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="filter-control"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="pending">To do</option><option value="followup">In progress</option><option value="delayed">Blocked</option><option value="submitted">In review</option><option value="closed">Completed</option><option value="overdue">Overdue</option></select></label><label className="filter-control"><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">All priorities</option><option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option></select></label><button className="button button-ghost button-small filter-button" type="button" onClick={() => { setSearch(''); setStatus('all'); setPriority('all'); }}><Icon name="filter" size={15} />Clear</button></div>{loading ? <div className="loading-list"><span /><span /><span /></div> : filteredTasks.length ? <><div className="task-table-heading"><span>Task</span><span>Owner</span><span>Priority</span><span>Status</span><span>Due</span><span /></div><div className="task-list task-list-desktop">{filteredTasks.map((task) => <div className="task-row task-row-grid" key={task.id}><div className="task-row-main"><span className="task-check"><Icon name={task.status === 'closed' ? 'checkCircle' : 'clipboard'} size={18} /></span><div className="task-copy"><Link href={`/tasks/${task.id}`} className="task-title">{task.title}</Link><div className="task-subline"><span>{task.category || 'General'}</span><span className="dot-separator" />{task.description || 'No description added'}</div></div></div><div className="task-owner"><span className="avatar avatar-xs">{(task.assignee?.name || 'U').slice(0, 1).toUpperCase()}</span>{task.assignee?.name || 'Unassigned'}</div><PriorityBadge priority={task.priority} /><StatusBadge status={task.status} compact /><span className={taskIsOverdue(task) ? 'due-date overdue' : 'due-date'}><Icon name="calendar" size={14} />{formatDate(task.eta, { month: 'short', day: 'numeric' })}</span><Link className="row-action" href={`/tasks/${task.id}`} aria-label={`Open ${task.title}`}><Icon name="chevronRight" size={17} /></Link></div>)}</div><div className="task-list task-list-mobile">{filteredTasks.map((task) => <div className="mobile-task-card" key={task.id}><div className="mobile-task-card-top"><Link href={`/tasks/${task.id}`} className="task-title">{task.title}</Link><StatusBadge status={task.status} compact /></div><div className="mobile-task-card-meta"><span>{task.assignee?.name || 'Unassigned'}</span><PriorityBadge priority={task.priority} /><span className={taskIsOverdue(task) ? 'overdue' : ''}><Icon name="calendar" size={13} />{formatDate(task.eta, { month: 'short', day: 'numeric' })}</span></div><p>{task.description || 'No description added'}</p><div className="mobile-task-card-footer"><span>{task.category || 'General'}</span><select className="status-select" aria-label={`Change status for ${task.title}`} value={task.status} onChange={(event) => changeStatus(task.id, event.target.value)}><option value="pending">To do</option><option value="followup">In progress</option><option value="delayed">Blocked</option><option value="submitted">In review</option><option value="closed">Completed</option></select></div></div>)}</div></> : <EmptyState icon="clipboard" title="No tasks match these filters" description="Try a different search or clear the filters to see more work." action="Create a task" />}</section>
    <Modal open={modalOpen} title="Create a task" description="Give one person a clear next step with enough context to finish well." onClose={() => setModalOpen(false)} wide><form className="modal-form" onSubmit={submit}><div className="form-grid form-grid-two"><div className="field field-wide"><label htmlFor="task-title">Task title<span>*</span></label><input id="task-title" className="input" required placeholder="e.g. Prepare weekly sales summary" value={form.title} onChange={(event) => updateForm('title', event.target.value)} /></div><div className="field"><label htmlFor="task-assignee">Assign to<span>*</span></label><select id="task-assignee" className="input" required value={form.assignee_id} onChange={(event) => updateForm('assignee_id', event.target.value)}><option value="">Choose a person</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></div><div className="field"><label htmlFor="task-priority">Priority</label><select id="task-priority" className="input" value={form.priority} onChange={(event) => updateForm('priority', event.target.value)}><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div><div className="field"><label htmlFor="task-category">Category</label><input id="task-category" className="input" placeholder="Operations, finance..." value={form.category} onChange={(event) => updateForm('category', event.target.value)} /></div><div className="field"><label htmlFor="task-due">Due date<span>*</span></label><input id="task-due" className="input" type="datetime-local" required value={form.eta} onChange={(event) => updateForm('eta', event.target.value)} /></div><div className="field field-wide"><label htmlFor="task-description">Description</label><textarea id="task-description" className="input" rows="4" placeholder="What does done look like?" value={form.description} onChange={(event) => updateForm('description', event.target.value)} /></div><div className="field field-wide"><label htmlFor="task-instructions">Instructions or handoff notes</label><textarea id="task-instructions" className="input" rows="3" placeholder="Add links, context, or specific expectations." value={form.instructions} onChange={(event) => updateForm('instructions', event.target.value)} /></div><label className="checkbox-field field-wide"><input type="checkbox" checked={form.proof_required} onChange={(event) => updateForm('proof_required', event.target.checked)} /><span><strong>Ask for completion proof</strong><small>Keep the handoff auditable when the task is submitted.</small></span></label></div>{error && <div className="form-error"><Icon name="warning" size={16} />{error}</div>}<div className="modal-actions"><button className="button button-ghost" type="button" onClick={() => setModalOpen(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create task'}{!saving && <Icon name="arrowUpRight" size={16} />}</button></div></form></Modal>
  </AppShell>;
}
