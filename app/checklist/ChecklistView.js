'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { Modal } from '../../components/UI';
import { ClearFiltersButton, FilterSelect, InlineError, ListEmpty, ListGroup, ListSkeleton, PersonChip, StatStrip, StatusIcon, Surface, SurfaceHeader, Toolbar, ToolbarSearch } from '../../components/Workflow';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { getAccessToken, getCurrentEmployee, peekCurrentEmployee } from '../../lib/auth';
import { peekQuery, queryKey, setQuery } from '../../lib/query-cache';
import { canManageChecklists, checklistFrequencies, checklistWeekdays, formatChecklistDays, formatChecklistDueAt, formatChecklistTime, ensureChecklistGeneratedToday, formatEmployeeId, getBusinessDate, getChecklistStatus, getChecklistTemplatesPage, setChecklistCompletion, triggerChecklistGeneration } from '../../lib/checklist-data';
import { isFreshRender, loadChecklistData } from '../../lib/page-data';
import { getPageCount, WORK_PAGE_SIZE } from '../../lib/work-list.mjs';
import { Spinner } from '../../components/Loader';

const emptyForm = { employee_id: '', task: '', frequency: 'daily', weekday: '1', monthly_days: ['1'], start_date: '', due_time: '17:00', day_of_month: '1', active: true };
const emptyBulkValues = { employee_id: '', task: '', frequency: 'daily', weekday: '1', monthly_days: ['1'], start_date: '', due_time: '17:00', active: true };

function ChecklistItemRow({ item, onComplete, completing }) {
  const status = getChecklistStatus(item);
  const completed = status === 'completed';
  return <li className="flex min-h-12 items-center gap-3 px-3 py-2 sm:px-4">
    <button type="button" className="-m-1.5 rounded-md p-1.5 hover:bg-muted disabled:opacity-60" disabled={completed || completing} aria-label={completed ? `${item.task} is complete` : `Mark "${item.task}" complete`} onClick={() => onComplete(item)}><StatusIcon status={status} size={18} /></button>
    <span className={cn('min-w-0 flex-1 text-[15.5px] font-medium sm:text-[15px]', completed && 'text-muted-foreground line-through')}>{item.task}</span>
    <span className={cn('shrink-0 text-[13.5px] tabular-nums', status === 'overdue' ? 'font-medium text-destructive' : 'text-muted-foreground')}>{completed ? 'Done' : formatChecklistDueAt(item.due_at)}</span>
  </li>;
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
      <div className="modal-actions"><button className="button button-ghost" type="button" onClick={preview ? onReset : onClose}>Cancel</button>{preview ? <button className="button button-primary" type="button" onClick={onImport} disabled={loading || (!allowDuplicates && !summary?.valid)}>{loading ? <><Spinner />Importing...</> : 'Import valid tasks'}</button> : <button className="button button-primary" type="button" onClick={onPreview} disabled={loading || !file}>{loading ? <><Spinner />Reading file...</> : 'Preview import'}</button>}</div>
    </>}
  </Modal>;
}

function BulkEditModal({ open, onClose, selectedCount, values, setValues, fields, setFields, review, setReview, loading, error, onApply }) {
  if (!open) return null;
  const toggle = (field) => setFields((current) => ({ ...current, [field]: !current[field] }));
  const selectedFields = Object.entries(fields).filter(([, enabled]) => enabled).map(([field]) => field);
  return <Modal open={open} title="Bulk edit checklist tasks" description={`Selected: ${selectedCount} checklist tasks`} onClose={onClose} wide>
    {review ? <div className="bulk-review"><strong>You&apos;re about to update {selectedCount} checklist templates.</strong><div className="bulk-review-list">{selectedFields.map((field) => <div key={field}><span>{field === 'employee_id' ? 'Employee' : field === 'due_time' ? 'Due time' : field === 'start_date' ? 'Start date' : field === 'active' ? 'Active status' : field === 'monthly_days' ? 'Monthly days' : field.replace('_', ' ')}</span><strong>{field === 'employee_id' ? values.employee_id || 'No change' : field === 'monthly_days' ? values.monthly_days.join(', ') : String(values[field] || 'No change')}</strong></div>)}</div><div className="modal-actions"><button className="button button-ghost" type="button" onClick={() => setReview(false)}>Back</button><button className="button button-primary" type="button" onClick={onApply} disabled={loading}>{loading ? <><Spinner />Applying...</> : 'Apply changes'}</button></div></div> : <>
      <div className="bulk-field-list"><label className="checkbox-field"><input type="checkbox" checked={fields.employee_id} onChange={() => toggle('employee_id')} /><span><strong>Employee</strong><small>Change the checklist assignment only.</small></span></label>{fields.employee_id && <select className="input" value={values.employee_id} onChange={(event) => setValues((current) => ({ ...current, employee_id: event.target.value }))}><option value="">Choose an employee</option>{values.employees?.filter((employee) => employee.active).map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select>}<label className="checkbox-field"><input type="checkbox" checked={fields.task} onChange={() => toggle('task')} /><span><strong>Task</strong><small>Replace the recurring task text.</small></span></label>{fields.task && <input className="input" maxLength="240" value={values.task} onChange={(event) => setValues((current) => ({ ...current, task: event.target.value }))} />}<label className="checkbox-field"><input type="checkbox" checked={fields.frequency} onChange={() => toggle('frequency')} /><span><strong>Frequency</strong><small>Update recurrence configuration.</small></span></label>{fields.frequency && <div className="bulk-frequency-fields"><select className="input" value={values.frequency} onChange={(event) => setValues((current) => ({ ...current, frequency: event.target.value }))}>{checklistFrequencies.map((frequency) => <option value={frequency.value} key={frequency.value}>{frequency.label}</option>)}</select>{values.frequency === 'weekly' && <select className="input" value={values.weekday} onChange={(event) => setValues((current) => ({ ...current, weekday: event.target.value }))}>{checklistWeekdays.map((weekday, index) => <option value={String(index)} key={weekday}>{weekday}</option>)}</select>}{values.frequency === 'monthly' && <select className="input" multiple value={values.monthly_days} onChange={(event) => setValues((current) => ({ ...current, monthly_days: [...event.target.selectedOptions].map((option) => option.value) }))}>{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option value={String(day)} key={day}>{day}</option>)}</select>}</div>}<label className="checkbox-field"><input type="checkbox" checked={fields.due_time} onChange={() => toggle('due_time')} /><span><strong>Due time</strong><small>Apply one timezone-aware due time to all selected templates.</small></span></label>{fields.due_time && <input className="input" type="time" value={values.due_time} onChange={(event) => setValues((current) => ({ ...current, due_time: event.target.value }))} />}<label className="checkbox-field"><input type="checkbox" checked={fields.start_date} onChange={() => toggle('start_date')} /><span><strong>Start date</strong><small>Future generation only; history remains unchanged.</small></span></label>{fields.start_date && <input className="input" type="date" value={values.start_date} onChange={(event) => setValues((current) => ({ ...current, start_date: event.target.value }))} />}<label className="checkbox-field"><input type="checkbox" checked={fields.active} onChange={() => toggle('active')} /><span><strong>Active status</strong><small>Inactive templates stop future generation without deleting history.</small></span></label>{fields.active && <select className="input" value={String(values.active)} onChange={(event) => setValues((current) => ({ ...current, active: event.target.value === 'true' }))}><option value="true">Active</option><option value="false">Inactive</option></select>}</div>
      {error && <div className="form-error" role="alert"><Icon name="warning" size={16} />{error}</div>}
      <div className="modal-actions"><button className="button button-ghost" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="button" onClick={() => { if (!selectedFields.length) return; setReview(true); }} disabled={!selectedFields.length}>Review changes</button></div>
    </>}
  </Modal>;
}

function checklistCacheKey(employeeId = peekCurrentEmployee()?.employee?.id) {
  return queryKey('checklist', employeeId);
}

export default function ChecklistView({ initialData }) {
  const [data, setData] = useState(() => initialData || peekQuery(checklistCacheKey())?.data || null);
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
  const [debouncedTemplateSearch, setDebouncedTemplateSearch] = useState('');
  const [templateEmployeeFilter, setTemplateEmployeeFilter] = useState('all');
  const [templateFrequencyFilter, setTemplateFrequencyFilter] = useState('all');
  const [templateStatusFilter, setTemplateStatusFilter] = useState('all');
  const [templatePage, setTemplatePage] = useState(0);
  const [templateTotal, setTemplateTotal] = useState(() => initialData?.templateTotal ?? peekQuery(checklistCacheKey())?.templateTotal ?? 0);
  const [loading, setLoading] = useState(() => !initialData && !peekQuery(checklistCacheKey()));
  const [saving, setSaving] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [completing, setCompleting] = useState(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const templateRequestRef = useRef(0);
  const templateQueryKeyRef = useRef('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedTemplateSearch(templateSearch.trim());
      setTemplatePage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [templateSearch]);

  async function load({ generate = true } = {}) {
    if (!peekQuery(checklistCacheKey())) setLoading(true);
    setError('');
    const { user, employee, error: employeeError } = await getCurrentEmployee();
    if (!user) { setLoading(false); return; }
    if (employeeError || !employee) { setError('Unable to load your workspace profile. Please try again.'); setLoading(false); return; }
    const manager = canManageChecklists(employee.role);
    const filters = { page: templatePage, search: debouncedTemplateSearch, employeeId: templateEmployeeFilter, frequency: templateFrequencyFilter, status: templateStatusFilter };
    // Show existing items right away; reload only if generation actually created new ones.
    const [initialResponse, generationResponse] = await Promise.all([loadChecklistData({ employee, filters }), manager && generate ? ensureChecklistGeneratedToday() : Promise.resolve(null)]);
    const response = generationResponse?.created > 0 ? await loadChecklistData({ employee, filters }) : initialResponse;
    if (response.error) { setError(response.error.message || 'Unable to load checklist data. Please try again.'); setLoading(false); return; }
    applyLoadedData(response.data, filters);
    if (generationResponse && !generationResponse.success) setError(generationResponse.error || 'Checklist generation failed.');
    setLoading(false);
  }

  function applyLoadedData(nextData, filters) {
    // Only the default template view is cached, since that is what a fresh visit renders.
    const defaultTemplateView = !filters.page && !filters.search && filters.employeeId === 'all' && filters.frequency === 'all' && filters.status === 'all';
    if (defaultTemplateView) setQuery(checklistCacheKey(nextData.employee.id), { data: nextData, templateTotal: nextData.templateTotal });
    setData(nextData);
    setTemplateTotal(nextData.templateTotal);
    templateQueryKeyRef.current = [filters.page, filters.search, filters.employeeId, filters.frequency, filters.status].join('|');
  }

  // Initial workspace/bootstrap load; later template filter changes use the bounded effect below.
  useEffect(() => {
    if (!initialData) { load(); return; }
    applyLoadedData(initialData, { page: 0, search: '', employeeId: 'all', frequency: 'all', status: 'all' });
    // The server rendered existing items; generate any new ones in the background and refresh only if some were created.
    if (initialData.manager) ensureChecklistGeneratedToday().then((response) => {
      if (response?.created > 0 || !isFreshRender(initialData)) load({ generate: false });
      else if (response && !response.success) setError(response.error || 'Checklist generation failed.');
    }).catch(() => setError('Checklist generation is unavailable right now. Existing items are still shown.'));
    else if (!isFreshRender(initialData)) load({ generate: false });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!data?.manager || loading) return undefined;
    const queryKey = [templatePage, debouncedTemplateSearch, templateEmployeeFilter, templateFrequencyFilter, templateStatusFilter].join('|');
    if (templateQueryKeyRef.current === queryKey) return undefined;
    templateQueryKeyRef.current = queryKey;
    const requestId = templateRequestRef.current + 1;
    templateRequestRef.current = requestId;
    const controller = new AbortController();
    async function refreshTemplates() {
      setTemplatesLoading(true);
      const response = await getChecklistTemplatesPage({ page: templatePage, pageSize: WORK_PAGE_SIZE, search: debouncedTemplateSearch, employeeId: templateEmployeeFilter, frequency: templateFrequencyFilter, status: templateStatusFilter, includeCount: templatePage === 0, signal: controller.signal });
      if (controller.signal.aborted || templateRequestRef.current !== requestId) return;
      setTemplatesLoading(false);
      if (response.error) {
        setError(response.error.message || 'Checklist templates could not be loaded.');
        return;
      }
      setData((current) => current ? { ...current, templates: response.data || [] } : current);
      if (response.count !== null && response.count !== undefined) setTemplateTotal(response.count);
    }
    refreshTemplates();
    return () => controller.abort();
  }, [data?.manager, debouncedTemplateSearch, loading, templateEmployeeFilter, templateFrequencyFilter, templatePage, templateStatusFilter]);

  const today = getBusinessDate();
  const canManage = Boolean(data?.manager);
  const items = useMemo(() => data?.items || [], [data]);
  const templates = useMemo(() => data?.templates || [], [data]);
  const employees = useMemo(() => data?.employees || [], [data]);
  const todayItems = useMemo(() => items.filter((item) => item?.id && item.due_date === today && item.status !== 'deactivated'), [items, today]);
  const filteredTemplates = templates;
  const templatePageCount = getPageCount(templateTotal, WORK_PAGE_SIZE);
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
    else { setMessage(editing ? 'Checklist updated. Open generated items were synchronized.' : 'Checklist created and scheduled.'); closeModal(); const generationResponse = await triggerChecklistGeneration(); if (!generationResponse?.success) setError(generationResponse?.error || 'Checklist saved, but its current item could not be generated.'); await load(); }
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
    const previousStatus = getChecklistStatus(item);
    setCompleting(item.id); setError('');
    // Tick it off immediately; restore the previous state if the server refuses.
    setData((current) => {
      if (!current) return current;
      const metrics = { ...current.metrics };
      if (previousStatus === 'pending') metrics.pending = Math.max(0, (metrics.pending || 0) - 1);
      if (previousStatus === 'overdue') metrics.overdue = Math.max(0, (metrics.overdue || 0) - 1);
      metrics.completed = (metrics.completed || 0) + 1;
      return { ...current, metrics, items: current.items.map((currentItem) => currentItem.id === item.id ? { ...currentItem, status: 'completed', completed_at: new Date().toISOString() } : currentItem) };
    });
    try {
      const { data: updatedItem, error: updateError } = await setChecklistCompletion(item.id);
      if (updateError) { setError(updateError.message); load({ generate: false }); return; }
      if (updatedItem) setData((current) => current ? { ...current, items: current.items.map((currentItem) => currentItem.id === item.id ? { ...currentItem, ...updatedItem } : currentItem) } : current);
    } catch (completionError) {
      console.error('Checklist item completion failed.', { message: completionError?.message });
      load({ generate: false });
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

  const filtersActive = Boolean(templateSearch.trim() || templateEmployeeFilter !== 'all' || templateFrequencyFilter !== 'all' || templateStatusFilter !== 'all');
  function clearTemplateFilters() { setTemplateSearch(''); setTemplateEmployeeFilter('all'); setTemplateFrequencyFilter('all'); setTemplateStatusFilter('all'); setTemplatePage(0); }
  const titleAction = canManage ? <><Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={openImport}><Icon name="upload" size={15} />Import XLSX</Button><Button size="sm" className="h-8 gap-1.5" onClick={openCreate}><Icon name="plus" size={15} />Add checklist</Button></> : null;
  const pending = todayItems.filter((item) => getChecklistStatus(item) !== 'completed');
  const done = todayItems.filter((item) => getChecklistStatus(item) === 'completed');
  return <AppShell title="Checklist" description={canManage ? 'Recurring daily, weekly, and monthly work for employees.' : 'Tick off your recurring work as you finish it.'} actions={titleAction}>
    {message && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[14px] text-emerald-800" role="status"><Icon name="checkCircle" size={15} />{message}<button type="button" className="ml-auto" aria-label="Dismiss" onClick={() => setMessage('')}><Icon name="close" size={14} /></button></div>}
    {error && !modalOpen && !importOpen && !bulkOpen && <Surface><InlineError message={error} onRetry={load} /></Surface>}
    {loading ? <Surface><ListSkeleton /></Surface> : canManage ? <>
      <StatStrip items={[
        { label: 'Templates', value: templateTotal, icon: 'list' },
        { label: "Today's items", value: todayItems.length, icon: 'calendar' },
        { label: 'Overdue', value: data.metrics?.overdue || 0, status: 'overdue', tone: 'danger' },
        { label: 'Completed', value: data.metrics?.completed || 0, status: 'completed' },
      ]} />
      <Surface>
        <SurfaceHeader title="Templates" description="Set the recurring rule once; items are generated automatically when due." actions={templatesLoading ? <span className="inline-flex items-center gap-1.5 text-[13.5px] text-muted-foreground"><Spinner />Updating…</span> : null} />
        <Toolbar search={<ToolbarSearch value={templateSearch} onChange={setTemplateSearch} placeholder="Search people or tasks" label="Search checklist templates" />}>
          <FilterSelect label="Person" value={templateEmployeeFilter} onChange={(value) => { setTemplateEmployeeFilter(value); setTemplatePage(0); }}><option value="all">Anyone</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</FilterSelect>
          <FilterSelect label="Repeats" value={templateFrequencyFilter} onChange={(value) => { setTemplateFrequencyFilter(value); setTemplatePage(0); }}><option value="all">Any</option>{checklistFrequencies.map((frequency) => <option value={frequency.value} key={frequency.value}>{frequency.label}</option>)}</FilterSelect>
          <FilterSelect label="Status" value={templateStatusFilter} onChange={(value) => { setTemplateStatusFilter(value); setTemplatePage(0); }}><option value="all">Any</option><option value="active">Active</option><option value="inactive">Inactive</option></FilterSelect>
          <ClearFiltersButton visible={filtersActive} onClick={clearTemplateFilters} />
        </Toolbar>
        {selectedIds.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-brand/15 bg-brand-soft/60 px-3 py-2 text-[14px] sm:px-4"><strong className="mr-auto font-semibold text-brand-dark">{selectedIds.length} selected</strong><Button variant="outline" size="sm" className="h-8 bg-background" onClick={openBulkEdit}>Edit</Button><Button variant="outline" size="sm" className="h-8 bg-background text-destructive" onClick={bulkDelete}>Delete</Button><Button variant="ghost" size="sm" className="h-8" onClick={clearSelection}>Clear</Button></div>}
        {templates.length ? <>
          <div className="flex h-9 items-center gap-3 border-b border-border bg-muted/50 px-3 text-[13px] font-medium text-muted-foreground sm:px-4">
            <input type="checkbox" className="size-4 accent-[var(--brand)]" aria-label="Select all visible checklist templates" checked={allVisibleSelected} onChange={toggleVisibleSelection} />
            <span className="flex-1">Task</span><span className="hidden w-44 md:block">Person</span><span className="hidden w-48 lg:block">Schedule</span><span className="w-20 text-right sm:w-24">Status</span><span className="w-8" />
          </div>
          <ul className="divide-y divide-border/70">{filteredTemplates.map((template) => <li key={template.id} className={cn('flex min-h-12 items-center gap-3 px-3 py-2 hover:bg-muted/40 sm:px-4', selectedIds.includes(template.id) && 'bg-brand-soft/40')}>
            <input type="checkbox" className="size-4 shrink-0 accent-[var(--brand)]" aria-label={`Select ${template.task}`} checked={selectedIds.includes(template.id)} onChange={() => toggleSelected(template.id)} />
            <div className="min-w-0 flex-1">
              <button type="button" className="block max-w-full text-left text-[15px] font-medium text-foreground hover:text-brand sm:truncate sm:text-[14.5px]" title={template.task} onClick={() => openEdit(template)}>{template.task}</button>
              <span className="mt-0.5 block truncate text-[13.5px] text-muted-foreground md:hidden">{template.employee_name || template.employee?.name || 'Unknown employee'} · {formatChecklistDays(template)} · {formatChecklistTime(template.due_time)}</span>
            </div>
            <span className="hidden w-44 min-w-0 text-[14px] text-muted-foreground md:block"><PersonChip name={template.employee_name || template.employee?.name || 'Unknown employee'} /><span className="mt-0.5 block truncate pl-[26px] text-[12.5px]">{formatEmployeeId(template.employee_id)}</span></span>
            <span className="hidden w-48 min-w-0 text-[14px] text-muted-foreground lg:block"><span className="block truncate text-foreground/80">{formatChecklistDays(template)}</span><span className="text-[13px]">{formatChecklistTime(template.due_time)}</span></span>
            <span className={cn('inline-flex w-20 shrink-0 items-center justify-end gap-1.5 text-[13.5px] font-medium sm:w-24', template.active ? 'text-emerald-700' : 'text-muted-foreground')}><span className={cn('size-1.5 rounded-full', template.active ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />{template.active ? 'Active' : 'Inactive'}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="size-8 shrink-0 text-muted-foreground" aria-label={`Actions for ${template.task}`}><Icon name="more" size={16} /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => openEdit(template)}><Icon name="edit" size={15} />Edit</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => deactivate(template)}><Icon name={template.active ? 'close' : 'check'} size={15} />{template.active ? 'Deactivate' : 'Activate'}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => deleteTemplate(template)}><Icon name="close" size={15} />Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>)}</ul>
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-[14px] text-muted-foreground"><span className="tabular-nums">{templateTotal} templates · Page {templatePage + 1} of {templatePageCount}</span><div className="flex gap-1.5"><Button variant="outline" size="sm" className="h-8" onClick={() => setTemplatePage((value) => Math.max(0, value - 1))} disabled={templatePage === 0}>Previous</Button><Button variant="outline" size="sm" className="h-8" onClick={() => setTemplatePage((value) => Math.min(templatePageCount - 1, value + 1))} disabled={templatePage + 1 >= templatePageCount}>Next</Button></div></div>
        </> : <ListEmpty icon="checkSquare" title={filtersActive ? 'No templates match these filters' : 'No checklist templates yet'} description={filtersActive ? 'Try a different search or clear the filters.' : 'Create recurring work for your employees to keep daily operations on track.'} action={filtersActive ? <Button variant="outline" size="sm" onClick={clearTemplateFilters}>Clear filters</Button> : <Button size="sm" onClick={openCreate}><Icon name="plus" size={15} />Add checklist</Button>} />}
      </Surface>
    </> : <Surface>
      {todayItems.length ? <>
        <div className="flex h-8 items-center gap-3 border-b border-border bg-muted/40 px-3 text-[13px] font-medium text-muted-foreground sm:px-4"><span className="w-[18px] shrink-0" /><span className="flex-1">Task</span><span>Due</span></div>
        {pending.length > 0 && <ListGroup title="To do today" count={pending.length} status="pending">{pending.map((item) => <ChecklistItemRow item={item} key={item.id} onComplete={completeItem} completing={completing === item.id} />)}</ListGroup>}
        {done.length > 0 && <ListGroup title="Done" count={done.length} status="completed" defaultOpen={false}>{done.map((item) => <ChecklistItemRow item={item} key={item.id} onComplete={completeItem} completing={completing === item.id} />)}</ListGroup>}
      </> : <ListEmpty icon="checkCircle" title="You're all caught up" description="No checklist items are due today." />}
    </Surface>}
    {canManage && <Modal open={modalOpen} title={editing ? 'Edit checklist' : 'Add checklist'} description="Create a recurring rule for one employee. Generated history stays unchanged when you edit the rule." onClose={closeModal} wide><form className="modal-form" onSubmit={save}><div className="form-grid form-grid-two"><div className="field field-wide"><label htmlFor="checklist-employee">Employee<span>*</span></label><select id="checklist-employee" className="input" required value={form.employee_id} onChange={(event) => updateForm('employee_id', event.target.value)}><option value="">Choose an employee</option>{employees.filter((employee) => employee.active).map((employee) => <option value={employee.id} key={employee.id}>{formatEmployeeId(employee.id)} — {employee.name}</option>)}</select></div><div className="field field-wide"><label htmlFor="checklist-task">Task<span>*</span></label><input id="checklist-task" className="input" required maxLength="240" placeholder="e.g. Check daily sales report" value={form.task} onChange={(event) => updateForm('task', event.target.value)} /></div><div className="field"><label htmlFor="checklist-frequency">Frequency<span>*</span></label><select id="checklist-frequency" className="input" required value={form.frequency} onChange={(event) => updateForm('frequency', event.target.value)}>{checklistFrequencies.map((frequency) => <option value={frequency.value} key={frequency.value}>{frequency.label}</option>)}</select></div><div className="field"><label htmlFor="checklist-start-date">Start/assign date<span>*</span></label><input id="checklist-start-date" className="input" type="date" required value={form.start_date} onChange={(event) => updateForm('start_date', event.target.value)} /></div>{form.frequency === 'weekly' && <div className="field"><label htmlFor="checklist-weekday">Day of week<span>*</span></label><select id="checklist-weekday" className="input" required value={form.weekday} onChange={(event) => updateForm('weekday', event.target.value)}>{checklistWeekdays.map((weekday, index) => <option value={index} key={weekday}>{weekday}</option>)}</select></div>}{form.frequency === 'monthly' && <div className="field"><label htmlFor="checklist-monthly-days">Days of month<span>*</span></label><select id="checklist-monthly-days" className="input" multiple required value={form.monthly_days} onChange={(event) => handleMonthlyDays(event, (days) => setForm((current) => ({ ...current, monthly_days: days })))}>{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option value={String(day)} key={day}>{day}</option>)}</select><small className="field-help">Hold Ctrl/Cmd to choose multiple days. Short months use the last available day.</small></div>}<div className="field"><label htmlFor="checklist-due-time">Due time<span>*</span></label><input id="checklist-due-time" className="input" type="time" required value={form.due_time} onChange={(event) => updateForm('due_time', event.target.value)} /></div><label className="checkbox-field field-wide"><input type="checkbox" checked={form.active} onChange={(event) => updateForm('active', event.target.checked)} /><span><strong>Active</strong><small>Deactivate recurring work without deleting its generated history.</small></span></label></div>{error && modalOpen && <div className="form-error"><Icon name="warning" size={16} />{error}</div>}<div className="modal-actions"><button className="button button-ghost" type="button" onClick={closeModal}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? <><Spinner />Saving...</> : editing ? 'Save changes' : 'Add checklist'}{!saving && <Icon name="arrowUpRight" size={16} />}</button></div></form></Modal>}
    <ImportModal open={importOpen} onClose={closeImport} startDate={importStartDate} setStartDate={setImportStartDate} file={importFile} setFile={setImportFile} preview={importPreview} result={importResult} allowDuplicates={importAllowDuplicates} setAllowDuplicates={setImportAllowDuplicates} loading={importLoading} error={error} onPreview={previewImport} onImport={importTasks} onReset={resetImport} />
    <BulkEditModal open={bulkOpen} onClose={closeBulk} selectedCount={selectedIds.length} values={bulkValues} setValues={setBulkValues} fields={bulkFields} setFields={setBulkFields} review={bulkReview} setReview={setBulkReview} loading={bulkLoading} error={error} onApply={applyBulkChanges} />
  </AppShell>;
}
