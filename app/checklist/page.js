'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import TaskTextTooltip from '../../components/TaskTextTooltip';
import { EmptyState, Modal, SectionHeader, StatusBadge } from '../../components/UI';
import { getAccessToken, getCurrentEmployee } from '../../lib/auth';
import { canManageChecklists, checklistFrequencies, checklistWeekdays, formatChecklistDays, formatChecklistTime, formatEmployeeId, getBusinessDate, getChecklistDashboardData, getChecklistSchemaError, getChecklistStatus, setChecklistCompletion, triggerChecklistGeneration } from '../../lib/checklist-data';
import { supabaseBrowser } from '../../lib/supabase-browser';

const emptyForm = { employee_id: '', task: '', frequency: 'daily', weekday: '1', monthly_days: ['1'], start_date: '', due_time: '17:00', day_of_month: '1', active: true };
const emptyBulkValues = { employee_id: '', task: '', frequency: 'daily', weekday: '1', monthly_days: ['1'], start_date: '', due_time: '17:00', active: true };

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

function todayLocalDate() {
  return getBusinessDate();
}

function ImportModal({ open, onClose, startDate, setStartDate, file, setFile, preview, result, allowDuplicates, setAllowDuplicates, loading, error, onPreview, onImport, onReset }) {
  if (!open) return null;
  const summary = preview?.summary;
  return <Modal open={open} title={result ? 'Import completed' : 'Import checklist tasks'} description={result ? 'The valid recurring checklist tasks were added without changing generated history.' : 'Upload an Excel file to create recurring checklist tasks for employees.'} onClose={onClose} wide>
    {result ? <div className="import-result"><div className="import-result-stat"><strong>{result.created}</strong><span>checklist templates created</span></div><div className="import-result-stat"><strong>{result.skippedDuplicates}</strong><span>duplicates skipped</span></div><div className="import-result-stat"><strong>{result.errors}</strong><span>rows requiring attention</span></div>{result.errorRows?.length ? <details className="import-error-list"><summary>View errors</summary>{result.errorRows.map((row) => <div key={row.rowNumber}>Row {row.rowNumber}: {row.status} — {row.error}</div>)}</details> : null}<div className="modal-actions"><button className="button button-primary" type="button" onClick={onClose}>Done</button></div></div> : <>
      <div className="form-grid form-grid-two"><div className="field field-wide"><label htmlFor="checklist-import-file">Excel file<span>*</span></label><input id="checklist-import-file" className="input" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(event) => setFile(event.target.files?.[0] || null)} /><small className="field-help">Required columns: Doer Name, Doer Email, Task Details, Task Type, ETA.</small></div><div className="field"><label htmlFor="checklist-import-start-date">Start date<span>*</span></label><input id="checklist-import-start-date" className="input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div><label className="checkbox-field field-wide"><input type="checkbox" checked={allowDuplicates} onChange={(event) => setAllowDuplicates(event.target.checked)} /><span><strong>Import duplicates</strong><small>Leave unchecked to skip matching active templates.</small></span></label></div>
      {error && <div className="form-error" role="alert"><Icon name="warning" size={16} />{error}</div>}
      {summary && <><div className="import-summary"><strong>{summary.rowsDetected} rows detected</strong><span>{summary.valid} valid</span><span>{summary.errors} errors</span><span>{summary.duplicates} duplicates</span></div><div className="import-preview-table"><div className="import-preview-row import-preview-header"><span>Employee</span><span>Email</span><span>Task</span><span>Frequency</span><span>Time</span><span>Status</span></div>{preview.rows.map((row) => <div className="import-preview-row" key={row.rowNumber}><span>{row.employee}</span><span>{row.email}</span><span>{row.task || '—'}</span><span>{row.taskType || '—'}</span><span>{row.dueTime || '—'}</span><span className={`import-status import-status-${row.status.toLowerCase().replaceAll(' ', '-')}`}>{row.status}</span></div>)}</div></>}
      <div className="modal-actions"><button className="button button-ghost" type="button" onClick={preview ? onReset : onClose}>Cancel</button>{preview ? <button className="button button-primary" type="button" onClick={onImport} disabled={loading || (!allowDuplicates && !summary?.valid)}>{loading ? 'Importing...' : 'Import valid tasks'}</button> : <button className="button button-primary" type="button" onClick={onPreview} disabled={loading || !file}>{loading ? 'Reading file...' : 'Preview import'}</button>}</div>
    </>}
  </Modal>;
}

function BulkEditModal({ open, onClose, selectedCount, values, setValues, fields, setFields, review, setReview, loading, error, onApply }) {
  if (!open) return null;
  const toggle = (field) => setFields((current) => ({ ...current, [field]: !current[field] }));
  const selectedFields = Object.entries(fields).filter(([, enabled]) => enabled).map(([field]) => field);
  return <Modal open={open} title="Bulk edit checklist tasks" description={`Selected: ${selectedCount} checklist tasks`} onClose={onClose} wide>
    {review ? <div className="bulk-review"><strong>You&apos;re about to update {selectedCount} checklist templates.</strong><div className="bulk-review-list">{selectedFields.map((field) => <div key={field}><span>{field === 'employee_id' ? 'Employee' : field === 'due_time' ? 'Due time' : field === 'start_date' ? 'Start date' : field === 'active' ? 'Active status' : field === 'monthly_days' ? 'Monthly days' : field.replace('_', ' ')}</span><strong>{field === 'employee_id' ? values.employee_id || 'No change' : field === 'monthly_days' ? values.monthly_days.join(', ') : String(values[field] || 'No change')}</strong></div>)}</div><div className="modal-actions"><button className="button button-ghost" type="button" onClick={() => setReview(false)}>Back</button><button className="button button-primary" type="button" onClick={onApply} disabled={loading}>{loading ? 'Applying...' : 'Apply changes'}</button></div></div> : <>
      <div className="bulk-field-list"><label className="checkbox-field"><input type="checkbox" checked={fields.employee_id} onChange={() => toggle('employee_id')} /><span><strong>Employee</strong><small>Change the checklist assignment only.</small></span></label>{fields.employee_id && <select className="input" value={values.employee_id} onChange={(event) => setValues((current) => ({ ...current, employee_id: event.target.value }))}><option value="">Choose an employee</option>{values.employees?.filter((employee) => employee.active).map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select>}<label className="checkbox-field"><input type="checkbox" checked={fields.task} onChange={() => toggle('task')} /><span><strong>Task</strong><small>Replace the recurring task text.</small></span></label>{fields.task && <input className="input" maxLength="240" value={values.task} onChange={(event) => setValues((current) => ({ ...current, task: event.target.value }))} />}<label className="checkbox-field"><input type="checkbox" checked={fields.frequency} onChange={() => toggle('frequency')} /><span><strong>Frequency</strong><small>Update recurrence configuration.</small></span></label>{fields.frequency && <div className="bulk-frequency-fields"><select className="input" value={values.frequency} onChange={(event) => setValues((current) => ({ ...current, frequency: event.target.value }))}>{checklistFrequencies.map((frequency) => <option value={frequency.value} key={frequency.value}>{frequency.label}</option>)}</select>{values.frequency === 'weekly' && <select className="input" value={values.weekday} onChange={(event) => setValues((current) => ({ ...current, weekday: event.target.value }))}>{checklistWeekdays.map((weekday, index) => <option value={String(index)} key={weekday}>{weekday}</option>)}</select>}{values.frequency === 'monthly' && <select className="input" multiple value={values.monthly_days} onChange={(event) => setValues((current) => ({ ...current, monthly_days: [...event.target.selectedOptions].map((option) => option.value) }))}>{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option value={String(day)} key={day}>{day}</option>)}</select>}</div>}<label className="checkbox-field"><input type="checkbox" checked={fields.due_time} onChange={() => toggle('due_time')} /><span><strong>Due time</strong><small>Apply one timezone-aware due time to all selected templates.</small></span></label>{fields.due_time && <input className="input" type="time" value={values.due_time} onChange={(event) => setValues((current) => ({ ...current, due_time: event.target.value }))} />}<label className="checkbox-field"><input type="checkbox" checked={fields.start_date} onChange={() => toggle('start_date')} /><span><strong>Start date</strong><small>Future generation only; history remains unchanged.</small></span></label>{fields.start_date && <input className="input" type="date" value={values.start_date} onChange={(event) => setValues((current) => ({ ...current, start_date: event.target.value }))} />}<label className="checkbox-field"><input type="checkbox" checked={fields.active} onChange={() => toggle('active')} /><span><strong>Active status</strong><small>Inactive templates stop future generation without deleting history.</small></span></label>{fields.active && <select className="input" value={String(values.active)} onChange={(event) => setValues((current) => ({ ...current, active: event.target.value === 'true' }))}><option value="true">Active</option><option value="false">Inactive</option></select>}</div>
      {error && <div className="form-error" role="alert"><Icon name="warning" size={16} />{error}</div>}
      <div className="modal-actions"><button className="button button-ghost" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="button" onClick={() => { if (!selectedFields.length) return; setReview(true); }} disabled={!selectedFields.length}>Review changes</button></div>
    </>}
  </Modal>;
}

export default function Checklist() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importStartDate, setImportStartDate] = useState(todayLocalDate());
  const [importPreview, setImportPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importAllowDuplicates, setImportAllowDuplicates] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFields, setBulkFields] = useState({ employee_id: false, task: false, frequency: false, due_time: false, start_date: false, active: false });
  const [bulkValues, setBulkValues] = useState(emptyBulkValues);
  const [bulkReview, setBulkReview] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateEmployeeFilter, setTemplateEmployeeFilter] = useState('all');
  const [templateFrequencyFilter, setTemplateFrequencyFilter] = useState('all');
  const [templateStatusFilter, setTemplateStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [completing, setCompleting] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    const { user, employee, error: employeeError } = await getCurrentEmployee();
    if (!user) { setLoading(false); return; }
    if (employeeError || !employee) { setError('Unable to load your workspace profile. Please try again.'); setLoading(false); return; }
    const manager = canManageChecklists(employee.role);
    const generationRequest = manager ? triggerChecklistGeneration() : Promise.resolve(null);
    const supabase = supabaseBrowser();
    const [templateResponse, employeeResponse] = await Promise.all([
      manager ? supabase.from('checklist_templates').select('id,employee_id,task,frequency,weekday,day_of_month,monthly_days,start_date,due_time,active,created_at,updated_at,employee:employees!checklist_templates_employee_id_fkey(id,name,email)').order('active', { ascending: false }).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
      manager ? supabase.from('employees').select('id,name,email,active,role').order('name') : Promise.resolve({ data: [], error: null }),
    ]);
    const generationResponse = await generationRequest;
    const itemResponse = await getChecklistDashboardData();
    const responseError = getChecklistSchemaError(itemResponse.error || templateResponse.error || employeeResponse.error);
    if (responseError) { setError(responseError.message || 'Unable to load checklist data. Please try again.'); setLoading(false); return; }
    setData({ userId: user.id, employee, manager, items: itemResponse.data?.todayItems || [], metrics: itemResponse.data?.metrics || {}, templates: templateResponse.data || [], employees: employeeResponse.data || [] });
    if (generationResponse && !generationResponse.success) setError(generationResponse.error || 'Checklist generation failed.');
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const today = getBusinessDate();
  const canManage = Boolean(data?.manager);
  const items = useMemo(() => data?.items || [], [data]);
  const templates = useMemo(() => data?.templates || [], [data]);
  const employees = useMemo(() => data?.employees || [], [data]);
  const todayItems = useMemo(() => items.filter((item) => item?.id && item.due_date === today && item.status !== 'deactivated'), [items, today]);
  const filteredTemplates = useMemo(() => templates.filter((template) => {
    const query = templateSearch.trim().toLowerCase();
    const matchesSearch = !query || [template.task, template.employee?.name, template.employee?.email].filter(Boolean).join(' ').toLowerCase().includes(query);
    return matchesSearch && (templateEmployeeFilter === 'all' || template.employee_id === templateEmployeeFilter) && (templateFrequencyFilter === 'all' || template.frequency === templateFrequencyFilter) && (templateStatusFilter === 'all' || (template.active ? 'active' : 'inactive') === templateStatusFilter);
  }), [templates, templateSearch, templateEmployeeFilter, templateFrequencyFilter, templateStatusFilter]);
  const allVisibleSelected = filteredTemplates.length > 0 && filteredTemplates.every((template) => selectedIds.includes(template.id));

  function updateForm(field, value) { setForm((current) => ({ ...current, [field]: value })); }
  function handleMonthlyDays(event, setter) { setter([...event.target.selectedOptions].map((option) => option.value)); }
  function openCreate() { setEditing(null); setForm({ ...emptyForm, start_date: today }); setError(''); setModalOpen(true); }
  function openEdit(template) { setEditing(template); setForm({ employee_id: template.employee_id, task: template.task, frequency: template.frequency, weekday: String(template.weekday ?? 1), monthly_days: (template.monthly_days?.length ? template.monthly_days : [template.day_of_month || 1]).map(String), start_date: template.start_date || today, due_time: template.due_time?.slice(0, 5) || '17:00', day_of_month: String(template.day_of_month ?? 1), active: template.active !== false }); setError(''); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditing(null); setError(''); }
  function resetImport() { setImportPreview(null); setImportResult(null); setImportFile(null); setImportAllowDuplicates(false); }
  function closeImport() { setImportOpen(false); resetImport(); }
  function openImport() { resetImport(); setImportStartDate(today); setImportOpen(true); }
  function toggleSelected(id) { setSelectedIds((current) => current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]); }
  function toggleVisibleSelection() { setSelectedIds((current) => allVisibleSelected ? current.filter((id) => !filteredTemplates.some((template) => template.id === id)) : [...new Set([...current, ...filteredTemplates.map((template) => template.id)])]); }
  function clearSelection() { setSelectedIds([]); }
  function openBulkEdit() { setBulkFields({ employee_id: false, task: false, frequency: false, due_time: false, start_date: false, active: false }); setBulkValues({ ...emptyBulkValues, start_date: today, employees }); setBulkReview(false); setError(''); setBulkOpen(true); }
  function closeBulk() { setBulkOpen(false); setBulkReview(false); setError(''); }
  async function save(event) {
    event.preventDefault();
    setSaving(true); setError('');
    if (!form.employee_id || !form.task.trim() || !form.start_date || !form.due_time) { setError('Employee, task, start date, and due time are required.'); setSaving(false); return; }
    if (form.frequency === 'weekly' && form.weekday === '') { setError('Choose a day of the week.'); setSaving(false); return; }
    if (form.frequency === 'monthly' && !form.monthly_days.length) { setError('Choose at least one monthly day.'); setSaving(false); return; }
    const record = { employee_id: form.employee_id, task: form.task.trim(), frequency: form.frequency, weekday: form.frequency === 'weekly' ? Number(form.weekday) : null, day_of_month: form.frequency === 'monthly' ? Number(form.monthly_days[0]) : null, monthly_days: form.frequency === 'monthly' ? form.monthly_days.map(Number) : [], start_date: form.start_date, due_time: form.due_time, active: form.active };
    const token = await getAccessToken();
    const response = await fetch('/api/checklist/templates', { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(editing ? { ...record, id: editing.id } : record) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The checklist template could not be saved.');
    else { setMessage(editing ? 'Checklist updated.' : 'Checklist created and scheduled.'); closeModal(); const generationResponse = await triggerChecklistGeneration(); if (!generationResponse?.success) setError(generationResponse?.error || 'Checklist saved, but its current item could not be generated.'); await load(); }
    setSaving(false);
  }

  async function deactivate(template) {
    const label = template.active ? 'deactivate' : 'activate';
    if (!window.confirm(`${label[0].toUpperCase()}${label.slice(1)} this recurring checklist?`)) return;
    const token = await getAccessToken();
    const response = await fetch('/api/checklist/templates', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ id: template.id, employee_id: template.employee_id, task: template.task, frequency: template.frequency, weekday: template.weekday, day_of_month: template.day_of_month, monthly_days: template.monthly_days || [], start_date: template.start_date, due_time: template.due_time?.slice(0, 5), active: !template.active }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The checklist template could not be updated.'); else { setMessage(`Checklist ${template.active ? 'deactivated' : 'activated'}.`); await load(); }
  }

  async function deleteTemplate(template) {
    if (!window.confirm(`Permanently delete "${template.task}"? This removes the checklist template and all of its generated checklist items. This cannot be undone.`)) return;
    const token = await getAccessToken();
    const response = await fetch('/api/checklist/templates', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ id: template.id }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The checklist task could not be deleted.'); else { setMessage('Checklist task and generated items deleted.'); await load(); }
  }

  async function completeItem(item) {
    if (completing || getChecklistStatus(item) === 'completed') return;
    setCompleting(item.id); setError('');
    try {
      const { data: updatedItem, error: updateError } = await setChecklistCompletion(item.id);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      const previousStatus = getChecklistStatus(item);
      setData((current) => {
        if (!current) return current;
        const metrics = { ...current.metrics };
        if (previousStatus === 'pending') metrics.pending = Math.max(0, (metrics.pending || 0) - 1);
        if (previousStatus === 'overdue') metrics.overdue = Math.max(0, (metrics.overdue || 0) - 1);
        if (previousStatus !== 'completed') metrics.completed = (metrics.completed || 0) + 1;
        return {
          ...current,
          items: current.items.map((currentItem) => currentItem.id === item.id ? { ...currentItem, ...(updatedItem || {}), status: 'completed', completed_at: updatedItem?.completed_at || new Date().toISOString() } : currentItem),
          metrics,
        };
      });
      setMessage('Checklist item completed.');
    } catch (completionError) {
      console.error('Checklist item completion failed.', { message: completionError?.message });
      setError('The checklist item could not be completed. Please try again.');
    } finally {
      setCompleting(null);
    }
  }

  async function previewImport() {
    setImportLoading(true); setError('');
    const token = await getAccessToken();
    const formData = new FormData(); formData.set('file', importFile); formData.set('startDate', importStartDate); formData.set('confirm', 'false'); formData.set('allowDuplicates', String(importAllowDuplicates));
    const response = await fetch('/api/checklist/import', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: formData });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The Excel file could not be previewed.'); else setImportPreview(payload);
    setImportLoading(false);
  }

  async function importTasks() {
    setImportLoading(true); setError('');
    const token = await getAccessToken();
    const formData = new FormData(); formData.set('file', importFile); formData.set('startDate', importStartDate); formData.set('confirm', 'true'); formData.set('allowDuplicates', String(importAllowDuplicates));
    const response = await fetch('/api/checklist/import', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: formData });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The checklist import could not be completed.'); else { setImportResult(payload); setMessage('Checklist import completed.'); await load(); }
    setImportLoading(false);
  }

  async function applyBulkChanges() {
    if (!bulkReview) { setBulkReview(true); return; }
    setBulkLoading(true); setError('');
    const changes = {};
    if (bulkFields.employee_id) changes.employee_id = bulkValues.employee_id;
    if (bulkFields.task) changes.task = bulkValues.task;
    if (bulkFields.frequency) { changes.frequency = bulkValues.frequency; changes.weekday = Number(bulkValues.weekday); changes.monthly_days = bulkValues.monthly_days.map(Number); changes.day_of_month = Number(bulkValues.monthly_days[0]); }
    if (bulkFields.due_time) changes.due_time = bulkValues.due_time;
    if (bulkFields.start_date) changes.start_date = bulkValues.start_date;
    if (bulkFields.active) changes.active = bulkValues.active;
    const token = await getAccessToken();
    const response = await fetch('/api/checklist/bulk-update', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ ids: selectedIds, changes }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The selected checklist templates could not be updated.'); else { setMessage(`${payload.updated} checklist templates updated.`); clearSelection(); closeBulk(); await load(); }
    setBulkLoading(false);
  }

  async function bulkDelete() {
    if (!window.confirm(`Permanently delete ${selectedIds.length} checklist templates?\n\nAll generated checklist items for these templates will also be deleted. This cannot be undone.`)) return;
    const token = await getAccessToken();
    const response = await fetch('/api/checklist/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ ids: selectedIds }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The selected checklist templates could not be deleted.'); else { setMessage(`${payload.deleted} checklist template${payload.deleted === 1 ? '' : 's'} and generated items deleted.`); clearSelection(); await load(); }
  }

  const titleAction = canManage ? <><button className="button button-ghost" type="button" onClick={openImport}><Icon name="upload" size={17} />Import XLSX</button><button className="button button-primary" type="button" onClick={openCreate}><Icon name="plus" size={17} />Add checklist</button></> : null;
  return <AppShell title="Checklist" eyebrow="Workspace / Checklist" description="Manage recurring daily, weekly, and monthly work for employees." actions={titleAction}>
    {message && <div className="inline-alert success"><Icon name="checkCircle" size={16} />{message}</div>}
    {error && !modalOpen && !importOpen && !bulkOpen && <div className="inline-alert error" role="alert"><Icon name="warning" size={16} />{error}<button className="button button-ghost button-small" type="button" onClick={load}>Try again</button></div>}
    {loading ? <section className="panel checklist-loading"><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /></section> : canManage ? <>
      <section className="task-summary-row checklist-summary"><div className="inline-stat"><span className="inline-stat-icon blue"><Icon name="list" size={16} /></span><div><strong>{templates.length}</strong><span>Templates</span></div></div><div className="inline-stat"><span className="inline-stat-icon purple"><Icon name="calendar" size={16} /></span><div><strong>{todayItems.length}</strong><span>Today&apos;s items</span></div></div><div className="inline-stat"><span className="inline-stat-icon orange"><Icon name="warning" size={16} /></span><div><strong>{data.metrics?.overdue || 0}</strong><span>Overdue</span></div></div><div className="inline-stat"><span className="inline-stat-icon mint"><Icon name="checkCircle" size={16} /></span><div><strong>{data.metrics?.completed || 0}</strong><span>Completed</span></div></div></section>
      <section className="panel checklist-panel"><SectionHeader eyebrow="Recurring work" title="Checklist templates" description="Set the recurring rule once. Scheduled items are generated automatically when due." />
        <div className="filter-bar checklist-template-filters"><label className="search-box"><Icon name="search" size={17} /><input aria-label="Search checklist templates" placeholder="Search employees or tasks" value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} /></label><label className="filter-control"><span>Employee</span><select value={templateEmployeeFilter} onChange={(event) => setTemplateEmployeeFilter(event.target.value)}><option value="all">All employees</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></label><label className="filter-control"><span>Frequency</span><select value={templateFrequencyFilter} onChange={(event) => setTemplateFrequencyFilter(event.target.value)}><option value="all">All frequencies</option>{checklistFrequencies.map((frequency) => <option value={frequency.value} key={frequency.value}>{frequency.label}</option>)}</select></label><label className="filter-control"><span>Status</span><select value={templateStatusFilter} onChange={(event) => setTemplateStatusFilter(event.target.value)}><option value="all">All status</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div>
        {selectedIds.length > 0 && <div className="checklist-bulk-toolbar"><strong>{selectedIds.length} selected</strong><button className="button button-ghost button-small" type="button" onClick={openBulkEdit}>Edit selected</button><button className="button button-ghost button-small" type="button" onClick={bulkDelete}>Delete selected</button><button className="button button-ghost button-small" type="button" onClick={clearSelection}>Clear selection</button></div>}
        {templates.length ? <div className="checklist-table-scroll"><div className="checklist-table-heading"><span className="checklist-selection-header"><input type="checkbox" aria-label="Select all visible checklist templates" checked={allVisibleSelected} onChange={toggleVisibleSelection} /></span><span>Employee ID</span><span>Name</span><span>Task</span><span>Days</span><span>Status</span><span /></div><div className="checklist-template-list">{filteredTemplates.map((template) => <div className="checklist-template-row" key={template.id}><span className="checklist-selection"><input type="checkbox" aria-label={`Select ${template.task}`} checked={selectedIds.includes(template.id)} onChange={() => toggleSelected(template.id)} /></span><div className="checklist-employee-id"><strong>{formatEmployeeId(template.employee_id)}</strong><small>{template.employee?.email || 'Workspace employee'}</small></div><strong className="checklist-employee-name">{template.employee?.name || 'Unknown employee'}</strong><TaskTextTooltip text={template.task} className="checklist-task-name" /><span className="checklist-days"><Icon name="calendar" size={14} /><span>{formatChecklistDays(template)}<small>{formatChecklistTime(template.due_time)}</small></span></span><span className={`access-pill ${template.active ? 'active' : 'inactive'}`}><span />{template.active ? 'Active' : 'Inactive'}</span><details className="checklist-actions"><summary aria-label={`Actions for ${template.task}`}><Icon name="more" size={17} /></summary><div className="checklist-actions-menu"><button type="button" onClick={() => openEdit(template)}><Icon name="edit" size={14} />Edit</button><button type="button" onClick={() => deactivate(template)}><Icon name={template.active ? 'close' : 'check'} size={14} />{template.active ? 'Deactivate' : 'Activate'}</button><button type="button" onClick={() => deleteTemplate(template)}><Icon name="close" size={14} />Delete</button></div></details></div>)}</div></div> : <EmptyState icon="checkSquare" title="No checklist tasks yet" description="Create recurring work for your employees to keep daily operations on track." action="Add checklist" onAction={openCreate} />}</section>
    </> : <section className="panel checklist-doer-panel"><SectionHeader eyebrow="Today" title="Today&apos;s checklist" description="Complete your recurring work as you finish it. Status is updated automatically." />{todayItems.length ? <div className="checklist-item-list">{todayItems.map((item) => <ChecklistItemCard item={item} key={item.id} onComplete={completeItem} completing={completing === item.id} />)}</div> : <EmptyState icon="checkCircle" title="You&apos;re all caught up" description="No checklist items are due today." />}</section>}
    {canManage && <Modal open={modalOpen} title={editing ? 'Edit checklist' : 'Add checklist'} description="Create a recurring rule for one employee. Generated history stays unchanged when you edit the rule." onClose={closeModal} wide><form className="modal-form" onSubmit={save}><div className="form-grid form-grid-two"><div className="field field-wide"><label htmlFor="checklist-employee">Employee<span>*</span></label><select id="checklist-employee" className="input" required value={form.employee_id} onChange={(event) => updateForm('employee_id', event.target.value)}><option value="">Choose an employee</option>{employees.filter((employee) => employee.active).map((employee) => <option value={employee.id} key={employee.id}>{formatEmployeeId(employee.id)} — {employee.name}</option>)}</select></div><div className="field field-wide"><label htmlFor="checklist-task">Task<span>*</span></label><input id="checklist-task" className="input" required maxLength="240" placeholder="e.g. Check daily sales report" value={form.task} onChange={(event) => updateForm('task', event.target.value)} /></div><div className="field"><label htmlFor="checklist-frequency">Frequency<span>*</span></label><select id="checklist-frequency" className="input" required value={form.frequency} onChange={(event) => updateForm('frequency', event.target.value)}>{checklistFrequencies.map((frequency) => <option value={frequency.value} key={frequency.value}>{frequency.label}</option>)}</select></div><div className="field"><label htmlFor="checklist-start-date">Start/assign date<span>*</span></label><input id="checklist-start-date" className="input" type="date" required value={form.start_date} onChange={(event) => updateForm('start_date', event.target.value)} /></div>{form.frequency === 'weekly' && <div className="field"><label htmlFor="checklist-weekday">Day of week<span>*</span></label><select id="checklist-weekday" className="input" required value={form.weekday} onChange={(event) => updateForm('weekday', event.target.value)}>{checklistWeekdays.map((weekday, index) => <option value={index} key={weekday}>{weekday}</option>)}</select></div>}{form.frequency === 'monthly' && <div className="field"><label htmlFor="checklist-monthly-days">Days of month<span>*</span></label><select id="checklist-monthly-days" className="input" multiple required value={form.monthly_days} onChange={(event) => handleMonthlyDays(event, (days) => setForm((current) => ({ ...current, monthly_days: days })))}>{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option value={String(day)} key={day}>{day}</option>)}</select><small className="field-help">Hold Ctrl/Cmd to choose multiple days. Short months use the last available day.</small></div>}<div className="field"><label htmlFor="checklist-due-time">Due time<span>*</span></label><input id="checklist-due-time" className="input" type="time" required value={form.due_time} onChange={(event) => updateForm('due_time', event.target.value)} /></div><label className="checkbox-field field-wide"><input type="checkbox" checked={form.active} onChange={(event) => updateForm('active', event.target.checked)} /><span><strong>Active</strong><small>Deactivate recurring work without deleting its generated history.</small></span></label></div>{error && modalOpen && <div className="form-error"><Icon name="warning" size={16} />{error}</div>}<div className="modal-actions"><button className="button button-ghost" type="button" onClick={closeModal}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Add checklist'}{!saving && <Icon name="arrowUpRight" size={16} />}</button></div></form></Modal>}
    <ImportModal open={importOpen} onClose={closeImport} startDate={importStartDate} setStartDate={setImportStartDate} file={importFile} setFile={setImportFile} preview={importPreview} result={importResult} allowDuplicates={importAllowDuplicates} setAllowDuplicates={setImportAllowDuplicates} loading={importLoading} error={error} onPreview={previewImport} onImport={importTasks} onReset={resetImport} />
    <BulkEditModal open={bulkOpen} onClose={closeBulk} selectedCount={selectedIds.length} values={bulkValues} setValues={setBulkValues} fields={bulkFields} setFields={setBulkFields} review={bulkReview} setReview={setBulkReview} loading={bulkLoading} error={error} onApply={applyBulkChanges} />
  </AppShell>;
}
