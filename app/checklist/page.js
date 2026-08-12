'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { EmptyState, Modal, SectionHeader, StatusBadge } from '../../components/UI';
import { getCurrentEmployee } from '../../lib/auth';
import { canManageChecklists, checklistFrequencies, checklistWeekdays, formatChecklistDays, formatChecklistDueAt, formatChecklistTime, formatEmployeeId, getBusinessDate, getChecklistStatus, setChecklistCompletion, triggerChecklistGeneration } from '../../lib/checklist-data';
import { supabaseBrowser } from '../../lib/supabase-browser';

const emptyForm = { employee_id: '', task: '', frequency: 'daily', weekday: '1', start_date: '', due_time: '17:00', day_of_month: '1', active: true };

function ChecklistItemCard({ item, onComplete, completing }) {
  const status = getChecklistStatus(item);
  const completed = status === 'completed';
  return <label className={`checklist-item-card${completed ? ' is-complete' : ''}${status === 'overdue' ? ' is-overdue' : ''}`}>
    <input type="checkbox" checked={completed} disabled={completed || completing} onChange={() => onComplete(item)} />
    <span className="checklist-item-check"><Icon name={completed ? 'check' : 'checkSquare'} size={17} /></span>
    <span className="checklist-item-copy"><strong>{item.task}</strong><small>{status === 'overdue' ? 'This item is overdue' : completed ? 'Completed' : 'Due today'}</small></span>
    <StatusBadge status={status} compact />
  </label>;
}

export default function Checklist() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState(getBusinessDate());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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

    const manager = canManageChecklists(employee.role);
    const supabase = supabaseBrowser();
    const itemQuery = supabase.from('checklist_items').select('id,template_id,employee_id,task,due_date,due_at,status,completed_at,completed_by,created_at,employee:employees!checklist_items_employee_id_fkey(id,name,email)').order('due_at', { ascending: false }).limit(500);
    const [itemResponse, templateResponse, employeeResponse] = await Promise.all([
      itemQuery,
      manager ? supabase.from('checklist_templates').select('id,employee_id,task,frequency,weekday,day_of_month,start_date,due_time,active,created_at,updated_at,employee:employees!checklist_templates_employee_id_fkey(id,name,email)').order('active', { ascending: false }).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
      manager ? supabase.from('employees').select('id,name,email,active,role').order('name') : Promise.resolve({ data: [], error: null }),
    ]);
    const responseError = itemResponse.error || templateResponse.error || employeeResponse.error;
    if (responseError) {
      setError(responseError.message || 'Unable to load checklist data. Please try again.');
      setLoading(false);
      return;
    }
    setData({ userId: user.id, employee, manager, items: itemResponse.data || [], templates: templateResponse.data || [], employees: employeeResponse.data || [] });
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const today = getBusinessDate();
  const canManage = Boolean(data?.manager);
  const items = useMemo(() => data?.items || [], [data]);
  const templates = useMemo(() => data?.templates || [], [data]);
  const employees = useMemo(() => data?.employees || [], [data]);
  const todayItems = useMemo(() => items.filter((item) => item.due_date === today), [items, today]);
  const filteredItems = useMemo(() => items.filter((item) => {
    const status = getChecklistStatus(item);
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [item.task, item.employee?.name, formatEmployeeId(item.employee_id)].filter(Boolean).join(' ').toLowerCase().includes(query);
    return matchesSearch && (employeeFilter === 'all' || item.employee_id === employeeFilter) && (statusFilter === 'all' || status === statusFilter) && (!dateFilter || item.due_date === dateFilter);
  }), [items, search, employeeFilter, statusFilter, dateFilter]);

  function updateForm(field, value) { setForm((current) => ({ ...current, [field]: value })); }
  function openCreate() { setEditing(null); setForm({ ...emptyForm, start_date: today }); setError(''); setModalOpen(true); }
  function openEdit(template) {
    setEditing(template);
    setForm({ employee_id: template.employee_id, task: template.task, frequency: template.frequency, weekday: String(template.weekday ?? 1), start_date: template.start_date || today, due_time: template.due_time?.slice(0, 5) || '17:00', day_of_month: String(template.day_of_month ?? 1), active: template.active !== false });
    setError('');
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditing(null); setError(''); }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    if (!form.employee_id || !form.task.trim() || !form.start_date || !form.due_time) { setError('Employee, task, start date, and due time are required.'); setSaving(false); return; }
    if (form.frequency === 'weekly' && form.weekday === '') { setError('Choose a day of the week.'); setSaving(false); return; }
    if (form.frequency === 'monthly' && !form.day_of_month) { setError('Choose a day of the month.'); setSaving(false); return; }
    const record = {
      employee_id: form.employee_id,
      task: form.task.trim(),
      frequency: form.frequency,
      weekday: form.frequency === 'weekly' ? Number(form.weekday) : null,
      day_of_month: form.frequency === 'monthly' ? Number(form.day_of_month) : null,
      start_date: form.start_date,
      due_time: form.due_time,
      active: form.active,
    };
    const supabase = supabaseBrowser();
    const response = editing
      ? await supabase.from('checklist_templates').update(record).eq('id', editing.id)
      : await supabase.from('checklist_templates').insert({ ...record, created_by: data.userId });
    if (response.error) setError(response.error.message);
    else {
      setMessage(editing ? 'Checklist updated.' : 'Checklist created and scheduled.');
      closeModal();
      try { await triggerChecklistGeneration(); } catch { /* The hourly cron remains the source of truth. */ }
      await load();
    }
    setSaving(false);
  }

  async function deactivate(template) {
    const label = template.active ? 'deactivate' : 'activate';
    if (!window.confirm(`${label[0].toUpperCase()}${label.slice(1)} this recurring checklist?`)) return;
    const { error: updateError } = await supabaseBrowser().from('checklist_templates').update({ active: !template.active }).eq('id', template.id);
    if (updateError) setError(updateError.message);
    else { setMessage(`Checklist ${template.active ? 'deactivated' : 'activated'}.`); await load(); }
  }

  async function softDelete(template) {
    if (!window.confirm('Delete this checklist template? Existing generated history will remain available.')) return;
    const { error: deleteError } = await supabaseBrowser().from('checklist_templates').update({ active: false }).eq('id', template.id);
    if (deleteError) setError(deleteError.message);
    else { setMessage('Checklist deactivated. Existing history was preserved.'); await load(); }
  }

  async function completeItem(item) {
    if (completing || getChecklistStatus(item) === 'completed') return;
    setCompleting(item.id);
    setError('');
    const { error: updateError } = await setChecklistCompletion(item.id);
    if (updateError) setError(updateError.message);
    else { setMessage('Checklist item completed.'); await load(); }
    setCompleting(null);
  }

  const titleAction = canManage ? <button className="button button-primary" type="button" onClick={openCreate}><Icon name="plus" size={17} />Add checklist</button> : null;

  return <AppShell title="Checklist" eyebrow="Workspace / Checklist" description="Manage recurring daily, weekly, and monthly work for employees." actions={titleAction}>
    {message && <div className="inline-alert success"><Icon name="checkCircle" size={16} />{message}</div>}
    {error && !modalOpen && <div className="inline-alert error" role="alert"><Icon name="warning" size={16} />{error}<button className="button button-ghost button-small" type="button" onClick={load}>Try again</button></div>}
    {loading ? <section className="panel checklist-loading"><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /></section> : canManage ? <>
      <section className="task-summary-row checklist-summary"><div className="inline-stat"><span className="inline-stat-icon blue"><Icon name="list" size={16} /></span><div><strong>{templates.length}</strong><span>Templates</span></div></div><div className="inline-stat"><span className="inline-stat-icon purple"><Icon name="calendar" size={16} /></span><div><strong>{todayItems.length}</strong><span>Today&apos;s items</span></div></div><div className="inline-stat"><span className="inline-stat-icon orange"><Icon name="warning" size={16} /></span><div><strong>{items.filter((item) => getChecklistStatus(item) === 'overdue').length}</strong><span>Overdue</span></div></div><div className="inline-stat"><span className="inline-stat-icon mint"><Icon name="checkCircle" size={16} /></span><div><strong>{items.filter((item) => getChecklistStatus(item) === 'completed').length}</strong><span>Completed</span></div></div></section>
      <section className="panel checklist-panel"><SectionHeader eyebrow="Recurring work" title="Checklist templates" description="Set the recurring rule once. Scheduled items are generated automatically when due." />{templates.length ? <div className="checklist-table-scroll"><div className="checklist-table-heading"><span>Employee ID</span><span>Name</span><span>Task</span><span>Days</span><span>Status</span><span /></div><div className="checklist-template-list">{templates.map((template) => <div className="checklist-template-row" key={template.id}><div className="checklist-employee-id"><strong>{formatEmployeeId(template.employee_id)}</strong><small>{template.employee?.email || 'Workspace employee'}</small></div><strong className="checklist-employee-name">{template.employee?.name || 'Unknown employee'}</strong><span className="checklist-task-name">{template.task}</span><span className="checklist-days"><Icon name="calendar" size={14} /><span>{formatChecklistDays(template)}<small>{formatChecklistTime(template.due_time)}</small></span></span><span className={`access-pill ${template.active ? 'active' : 'inactive'}`}><span />{template.active ? 'Active' : 'Inactive'}</span><details className="checklist-actions"><summary aria-label={`Actions for ${template.task}`}><Icon name="more" size={17} /></summary><div className="checklist-actions-menu"><button type="button" onClick={() => openEdit(template)}><Icon name="edit" size={14} />Edit</button><button type="button" onClick={() => deactivate(template)}><Icon name={template.active ? 'close' : 'check'} size={14} />{template.active ? 'Deactivate' : 'Activate'}</button><button type="button" onClick={() => softDelete(template)}><Icon name="close" size={14} />Delete</button></div></details></div>)}</div></div> : <EmptyState icon="checkSquare" title="No checklist tasks yet" description="Create recurring work for your employees to keep daily operations on track." action="Add checklist" onAction={openCreate} />}</section>
      <section className="panel checklist-panel"><SectionHeader eyebrow="Generated items" title="Checklist history" description="Review generated work and its automatically calculated status." /><div className="filter-bar checklist-filter-bar"><label className="search-box"><Icon name="search" size={17} /><input aria-label="Search checklist items" placeholder="Search tasks or employees" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="filter-control"><span>Employee</span><select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}><option value="all">All employees</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></label><label className="filter-control"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="overdue">Overdue</option><option value="completed">Completed</option></select></label><label className="filter-control"><span>Date</span><input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></label><button className="button button-ghost button-small filter-button" type="button" onClick={() => { setSearch(''); setEmployeeFilter('all'); setStatusFilter('all'); setDateFilter(''); }}><Icon name="filter" size={15} />Clear</button></div>{filteredItems.length ? <div className="checklist-items-table"><div className="checklist-item-row checklist-item-header"><span>Due</span><span>Employee</span><span>Task</span><span>Status</span></div>{filteredItems.map((item) => <div className="checklist-item-row" key={item.id}><span>{formatChecklistDueAt(item.due_at)}</span><span>{item.employee?.name || formatEmployeeId(item.employee_id)}</span><strong>{item.task}</strong><StatusBadge status={getChecklistStatus(item)} compact /></div>)}</div> : <EmptyState compact icon="checkCircle" title="No generated items found" description="Adjust the filters or wait for the next scheduled occurrence." />}</section>
    </> : <section className="panel checklist-doer-panel"><SectionHeader eyebrow="Today" title="Today&apos;s checklist" description="Complete your recurring work as you finish it. Status is updated automatically." />{todayItems.length ? <div className="checklist-item-list">{todayItems.map((item) => <ChecklistItemCard item={item} key={item.id} onComplete={completeItem} completing={completing === item.id} />)}</div> : <EmptyState icon="checkCircle" title="You&apos;re all caught up" description="No checklist items are due today." />}</section>}
    {canManage && <Modal open={modalOpen} title={editing ? 'Edit checklist' : 'Add checklist'} description="Create a recurring rule for one employee. Generated history stays unchanged when you edit the rule." onClose={closeModal} wide><form className="modal-form" onSubmit={save}><div className="form-grid form-grid-two"><div className="field field-wide"><label htmlFor="checklist-employee">Employee<span>*</span></label><select id="checklist-employee" className="input" required value={form.employee_id} onChange={(event) => updateForm('employee_id', event.target.value)}><option value="">Choose an employee</option>{employees.filter((employee) => employee.active).map((employee) => <option value={employee.id} key={employee.id}>{formatEmployeeId(employee.id)} — {employee.name}</option>)}</select></div><div className="field field-wide"><label htmlFor="checklist-task">Task<span>*</span></label><input id="checklist-task" className="input" required maxLength="240" placeholder="e.g. Check daily sales report" value={form.task} onChange={(event) => updateForm('task', event.target.value)} /></div><div className="field"><label htmlFor="checklist-frequency">Frequency<span>*</span></label><select id="checklist-frequency" className="input" required value={form.frequency} onChange={(event) => updateForm('frequency', event.target.value)}>{checklistFrequencies.map((frequency) => <option value={frequency.value} key={frequency.value}>{frequency.label}</option>)}</select></div><div className="field"><label htmlFor="checklist-start-date">Start/assign date<span>*</span></label><input id="checklist-start-date" className="input" type="date" required value={form.start_date} onChange={(event) => updateForm('start_date', event.target.value)} /></div>{form.frequency === 'weekly' && <div className="field"><label htmlFor="checklist-weekday">Day of week<span>*</span></label><select id="checklist-weekday" className="input" required value={form.weekday} onChange={(event) => updateForm('weekday', event.target.value)}>{checklistWeekdays.map((weekday, index) => <option value={index} key={weekday}>{weekday}</option>)}</select></div>}{form.frequency === 'monthly' && <div className="field"><label htmlFor="checklist-day-of-month">Day of month<span>*</span></label><select id="checklist-day-of-month" className="input" required value={form.day_of_month} onChange={(event) => updateForm('day_of_month', event.target.value)}>{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option value={day} key={day}>{day}</option>)}</select><small className="field-help">If a month is shorter, the item is generated on that month&apos;s last day.</small></div>}<div className="field"><label htmlFor="checklist-due-time">Due time<span>*</span></label><input id="checklist-due-time" className="input" type="time" required value={form.due_time} onChange={(event) => updateForm('due_time', event.target.value)} /></div><label className="checkbox-field field-wide"><input type="checkbox" checked={form.active} onChange={(event) => updateForm('active', event.target.checked)} /><span><strong>Active</strong><small>Deactivate recurring work without deleting its generated history.</small></span></label></div>{error && <div className="form-error"><Icon name="warning" size={16} />{error}</div>}<div className="modal-actions"><button className="button button-ghost" type="button" onClick={closeModal}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Add checklist'}{!saving && <Icon name="arrowUpRight" size={16} />}</button></div></form></Modal>}
  </AppShell>;
}
