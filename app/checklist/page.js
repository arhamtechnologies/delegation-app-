'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { EmptyState, Modal, SectionHeader, StatusBadge } from '../../components/UI';
import { getAccessToken, getCurrentEmployee } from '../../lib/auth';
import { canDeactivateNonWorkingDayTasks, canManageChecklists, checklistFrequencies, checklistWeekdays, formatChecklistDays, formatChecklistDueAt, formatChecklistTime, formatEmployeeId, getBusinessDate, getChecklistDashboardData, getChecklistSchemaError, getChecklistStatus, setChecklistCompletion, triggerChecklistGeneration } from '../../lib/checklist-data';
import { defaultChecklistTimeZone, getChecklistBusinessDate } from '../../lib/checklist-time';
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

function formatSelectedDate(value) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`));
}

function NonWorkingDayModal({ open, date, onDateChange, loading, preview, error, confirming, onConfirm, onCancelConfirm, onApply, saving, onClose, simple, simpleProps }) {
  if (simple) return <SimpleNonWorkingDayModal {...simpleProps} />;
  if (!open) return null;
  const conditions = [];
  if (preview?.isSunday) conditions.push(<span className="non-working-day-condition" key="sunday">SUNDAY</span>);
  if (preview?.isNationalHoliday) conditions.push(<span className="non-working-day-condition holiday" key="holiday">NATIONAL HOLIDAY{preview.holidayNames?.length ? ` · ${preview.holidayNames.join(', ')}` : ''}</span>);
  if (preview?.employeesOnLeave) conditions.push(<span className="non-working-day-condition leave" key="leave">{preview.employeesOnLeave} EMPLOYEES ON LEAVE</span>);
  const hasCondition = Boolean(preview && (preview.isSunday || preview.isNationalHoliday || preview.employeesOnLeave));
  return <Modal open={open} title="Deactivate checklist tasks" description="This will deactivate active checklist tasks scheduled for Sundays, national holidays, and employee leave days." onClose={onClose} wide><div className="non-working-day-form"><div className="field"><label htmlFor="non-working-day-date">Date<span>*</span></label><input id="non-working-day-date" className="input" type="date" value={date} onChange={onDateChange} /></div>{loading ? <div className="loading-list non-working-day-loading" aria-label="Loading preview"><span /><span /><span /></div> : preview && <>{confirming ? <div className="non-working-day-confirmation"><strong>You are about to deactivate {preview.eligibleCount} checklist tasks scheduled for {formatSelectedDate(preview.date)}.</strong><div className="modal-actions"><button className="button button-ghost" type="button" onClick={onCancelConfirm}>Cancel</button><button className="button button-primary" type="button" onClick={onApply} disabled={saving}>{saving ? 'Deactivating...' : 'Deactivate tasks'}{!saving && <Icon name="arrowUpRight" size={16} />}</button></div></div> : <><div className="non-working-day-conditions">{conditions.length ? conditions : <span className="non-working-day-condition normal">NORMAL WORKING DAY</span>}</div>{!preview.isNationalHoliday && <div className="non-working-day-holiday-note">{preview.holidayRecordConfigured ? 'National holiday record is disabled for this date.' : 'National holiday record not configured for this date.'}</div>}<div className="non-working-day-summary"><div><span>Date</span><strong>{formatSelectedDate(preview.date)}</strong></div><div><span>Sunday tasks</span><strong>{preview.sundayCount}</strong></div><div><span>National holiday tasks</span><strong>{preview.holidayCount}</strong></div><div><span>Employee leave tasks</span><strong>{preview.leaveCount}</strong></div><div><span>Total distinct</span><strong>{preview.eligibleCount}</strong></div></div><div className="non-working-day-leave-count">Employees on leave: <strong>{preview.employeesOnLeave}</strong></div>{preview.items.length ? <div className="non-working-day-preview-list">{preview.items.map((item) => <div className="non-working-day-preview-item" key={item.id}><div><strong>{item.employee?.name || formatEmployeeId(item.employeeId)}</strong><span>{item.task}</span></div><div><small>{formatChecklistDueAt(item.dueAt)}</small><small>{item.reason}</small></div></div>)}</div> : <div className="empty-state empty-compact"><span className="empty-icon"><Icon name="checkCircle" size={22} /></span><h3>{hasCondition ? 'No active checklist tasks need to be deactivated for this date.' : 'No checklist tasks will be deactivated for this date.'}</h3></div>}<div className="modal-actions"><button className="button button-ghost" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="button" onClick={onConfirm} disabled={!preview.eligibleCount}>Deactivate {preview.eligibleCount} tasks<Icon name="arrowUpRight" size={16} /></button></div></>}</>}{error && <div className="form-error" role="alert"><Icon name="warning" size={16} />{error}</div>}</div></Modal>;
}

function NationalHolidayModal({ open, editing, form, onChange, onClose, onSave, saving, error }) {
  if (!open) return null;
  return <Modal open={open} title={editing ? 'Edit national holiday' : 'Add national holiday'} description="Configure the calendar records used by non-working-day checklist previews." onClose={onClose}>
    <form className="modal-form" onSubmit={onSave}>
      <div className="form-grid form-grid-two">
        <div className="field"><label htmlFor="national-holiday-date">Date<span>*</span></label><input id="national-holiday-date" className="input" type="date" required value={form.holiday_date} onChange={(event) => onChange('holiday_date', event.target.value)} /></div>
        <div className="field"><label htmlFor="national-holiday-country">Country<span>*</span></label><select id="national-holiday-country" className="input" required value={form.country} onChange={(event) => onChange('country', event.target.value)}><option>India</option><option>Australia</option><option>Singapore</option><option>United Arab Emirates</option><option>United Kingdom</option><option>United States</option></select></div>
        <div className="field field-wide"><label htmlFor="national-holiday-name">Holiday name<span>*</span></label><input id="national-holiday-name" className="input" required maxLength={160} placeholder="e.g. Independence Day" value={form.name} onChange={(event) => onChange('name', event.target.value)} /></div>
        <label className="checkbox-field field-wide"><input type="checkbox" checked={form.is_active} onChange={(event) => onChange('is_active', event.target.checked)} /><span><strong>Enabled</strong><small>Disabled records remain available for history but do not trigger previews.</small></span></label>
      </div>
      {error && <div className="form-error" role="alert"><Icon name="warning" size={16} />{error}</div>}
      <div className="modal-actions"><button className="button button-ghost" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save holiday' : 'Add holiday'}{!saving && <Icon name="arrowUpRight" size={16} />}</button></div>
    </form>
  </Modal>;
}

function DateChips({ dates, onRemove }) {
  return dates.length ? <div className="non-working-day-date-chips">{dates.map((date) => <span className="non-working-day-date-chip" key={date}>{formatSelectedDate(date)}<button type="button" aria-label={`Remove ${formatSelectedDate(date)}`} onClick={() => onRemove(date)}>×</button></span>)}</div> : <small className="field-help">No dates selected yet.</small>;
}

function SimpleNonWorkingDayModal({ open, reason, onReasonChange, date, onDateChange, leaveWorkingEmployees, leaveEmployeeId, onLeaveEmployeeChange, leaveDates, leaveDateInput, onLeaveDateInputChange, onAddLeaveDate, onRemoveLeaveDate, holidayName, onHolidayNameChange, holidayDates, holidayDateInput, onHolidayDateInputChange, onAddHolidayDate, onRemoveHolidayDate, onSaveConfig, configSaving, loading, preview, error, confirming, onConfirm, onCancelConfirm, onApply, saving, onClose }) {
  if (!open) return null;
  const conditions = [];
  if (preview?.isSunday) conditions.push(<span className="non-working-day-condition" key="sunday">SUNDAY · AUTOMATICALLY DETECTED</span>);
  if (preview?.isNationalHoliday) conditions.push(<span className="non-working-day-condition holiday" key="holiday">NATIONAL HOLIDAY{preview.holidayNames?.length ? ` · ${preview.holidayNames.join(', ')}` : ''}</span>);
  if (preview?.employeesOnLeave) conditions.push(<span className="non-working-day-condition leave" key="leave">{preview.employeesOnLeave} EMPLOYEES ON LEAVE</span>);
  const hasCondition = Boolean(preview && (preview.isSunday || preview.isNationalHoliday || preview.employeesOnLeave));
  return <Modal open={open} title="Non-working days" description="Select dates and tell us why the checklist work should not run." onClose={onClose} wide>
    <div className="non-working-day-form">
      <div className="field"><label htmlFor="non-working-day-reason">Reason<span>*</span></label><select id="non-working-day-reason" className="input" value={reason} onChange={(event) => onReasonChange(event.target.value)}><option value="employee_leave">Employee Leave</option><option value="national_holiday">National Holiday</option></select><small className="field-help">Sunday is detected automatically.</small></div>
      {reason === 'employee_leave' ? <section className="non-working-day-config"><div className="field"><label htmlFor="non-working-day-employee">Employee<span>*</span></label><select id="non-working-day-employee" className="input" value={leaveEmployeeId} onChange={(event) => onLeaveEmployeeChange(event.target.value)}><option value="">Select employee</option>{leaveWorkingEmployees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></div><div className="field"><label htmlFor="non-working-day-leave-date">Dates<span>*</span></label><div className="non-working-day-add-date"><input id="non-working-day-leave-date" className="input" type="date" value={leaveDateInput} onChange={onLeaveDateInputChange} /><button className="button button-ghost button-small" type="button" onClick={onAddLeaveDate}>+ Add date</button></div><DateChips dates={leaveDates} onRemove={onRemoveLeaveDate} /></div><button className="button button-primary" type="button" onClick={onSaveConfig} disabled={configSaving || !leaveEmployeeId || !leaveDates.length}>{configSaving ? 'Saving...' : 'Save leave dates'}</button></section> : <section className="non-working-day-config"><div className="field"><label htmlFor="non-working-day-holiday-date">Dates<span>*</span></label><div className="non-working-day-add-date"><input id="non-working-day-holiday-date" className="input" type="date" value={holidayDateInput} onChange={onHolidayDateInputChange} /><button className="button button-ghost button-small" type="button" onClick={onAddHolidayDate}>+ Add date</button></div><DateChips dates={holidayDates} onRemove={onRemoveHolidayDate} /></div><div className="field"><label htmlFor="non-working-day-holiday-name">Holiday name<span>*</span></label><input id="non-working-day-holiday-name" className="input" maxLength={160} value={holidayName} onChange={(event) => onHolidayNameChange(event.target.value)} placeholder="e.g. Independence Day" /></div><button className="button button-primary" type="button" onClick={onSaveConfig} disabled={configSaving || !holidayName.trim() || !holidayDates.length}>{configSaving ? 'Saving...' : 'Save holiday'}</button></section>}
      <div className="non-working-day-divider" />
      <div className="non-working-day-preview-heading"><div><strong>Preview deactivation</strong><small>Choose any date to see what would be affected.</small></div><div className="field"><label htmlFor="non-working-day-date">Date<span>*</span></label><input id="non-working-day-date" className="input" type="date" value={date} onChange={onDateChange} /></div></div>
      {loading ? <div className="loading-list non-working-day-loading" aria-label="Loading preview"><span /><span /><span /></div> : preview && <>{confirming ? <div className="non-working-day-confirmation"><strong>You are about to deactivate {preview.eligibleCount} checklist tasks scheduled for {formatSelectedDate(preview.date)}.</strong><div className="modal-actions"><button className="button button-ghost" type="button" onClick={onCancelConfirm}>Cancel</button><button className="button button-primary" type="button" onClick={onApply} disabled={saving}>{saving ? 'Deactivating...' : 'Deactivate tasks'}</button></div></div> : <><div className="non-working-day-conditions">{conditions.length ? conditions : <span className="non-working-day-condition normal">NORMAL WORKING DAY</span>}</div>{!preview.isNationalHoliday && <div className="non-working-day-holiday-note">{preview.holidayRecordConfigured ? 'National holiday record is disabled for this date.' : 'National holiday record not configured for this date.'}</div>}<div className="non-working-day-summary"><div><span>Sunday tasks</span><strong>{preview.sundayCount}</strong></div><div><span>National holiday tasks</span><strong>{preview.holidayCount}</strong></div><div><span>Employee leave tasks</span><strong>{preview.leaveCount}</strong></div><div><span>Employees on leave</span><strong>{preview.employeesOnLeave}</strong></div><div><span>Total distinct tasks</span><strong>{preview.eligibleCount}</strong></div></div>{preview.items.length ? <div className="non-working-day-preview-list">{preview.items.map((item) => <div className="non-working-day-preview-item" key={item.id}><div><strong>{item.employee?.name || formatEmployeeId(item.employeeId)}</strong><span>{item.task}</span></div><div><small>{formatChecklistDueAt(item.dueAt)}</small><small>{item.reason}</small></div></div>)}</div> : <div className="empty-state empty-compact"><span className="empty-icon"><Icon name="checkCircle" size={22} /></span><h3>{hasCondition ? 'No active checklist tasks need to be deactivated for this date.' : 'No checklist tasks will be deactivated for this date.'}</h3></div>}<div className="modal-actions"><button className="button button-ghost" type="button" onClick={onClose}>Close</button><button className="button button-primary" type="button" onClick={onConfirm} disabled={!preview.eligibleCount}>Deactivate {preview.eligibleCount} tasks</button></div></>}</>}{error && <div className="form-error" role="alert"><Icon name="warning" size={16} />{error}</div>}
    </div>
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
  const [nonWorkingDayOpen, setNonWorkingDayOpen] = useState(false);
  const [nonWorkingDayDate, setNonWorkingDayDate] = useState(getChecklistBusinessDate(new Date(), defaultChecklistTimeZone));
  const [nonWorkingDayPreview, setNonWorkingDayPreview] = useState(null);
  const [nonWorkingDayLoading, setNonWorkingDayLoading] = useState(false);
  const [nonWorkingDaySaving, setNonWorkingDaySaving] = useState(false);
  const [nonWorkingDayConfirming, setNonWorkingDayConfirming] = useState(false);
  const nonWorkingDayPreviewRequest = useRef(0);
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [holidayEditing, setHolidayEditing] = useState(null);
  const [holidayForm, setHolidayForm] = useState({ holiday_date: getChecklistBusinessDate(new Date(), defaultChecklistTimeZone), name: '', country: 'India', is_active: true });
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [holidayError, setHolidayError] = useState('');
  const [nonWorkingDayReason, setNonWorkingDayReason] = useState('employee_leave');
  const [leaveEmployeeId, setLeaveEmployeeId] = useState('');
  const [leaveDates, setLeaveDates] = useState([]);
  const [leaveDateInput, setLeaveDateInput] = useState('');
  const [holidayDates, setHolidayDates] = useState([]);
  const [holidayDateInput, setHolidayDateInput] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [nonWorkingDayConfigSaving, setNonWorkingDayConfigSaving] = useState(false);
  const [nonWorkingDayLeaveEditingEmployeeId, setNonWorkingDayLeaveEditingEmployeeId] = useState('');
  const [nonWorkingDayHolidayEditingIds, setNonWorkingDayHolidayEditingIds] = useState([]);
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
    const configRequest = canDeactivateNonWorkingDayTasks(employee.role) ? (async () => {
      const token = await getAccessToken();
      const response = await fetch('/api/checklist/non-working-days', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    })() : Promise.resolve({ response: null, payload: {} });
    const [templateResponse, employeeResponse, configResult] = await Promise.all([
      manager ? supabase.from('checklist_templates').select('id,employee_id,task,frequency,weekday,day_of_month,monthly_days,start_date,due_time,active,created_at,updated_at,employee:employees!checklist_templates_employee_id_fkey(id,name,email)').order('active', { ascending: false }).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
      manager ? supabase.from('employees').select('id,name,email,active,role').order('name') : Promise.resolve({ data: [], error: null }),
      configRequest,
    ]);
    const generationResponse = await generationRequest;
    const itemResponse = await getChecklistDashboardData();
    const responseError = getChecklistSchemaError(itemResponse.error || templateResponse.error || employeeResponse.error);
    if (responseError) { setError(responseError.message || 'Unable to load checklist data. Please try again.'); setLoading(false); return; }
    let holidays = [];
    let employeeLeave = [];
    if (canDeactivateNonWorkingDayTasks(employee.role)) {
      if (configResult.response?.ok) {
        holidays = configResult.payload.holidays || [];
        employeeLeave = configResult.payload.employeeLeave || [];
        setHolidayError('');
      } else {
        setHolidayError(configResult.payload.error || 'Non-working-day settings could not be loaded. Apply the latest Supabase migration, then retry.');
      }
    } else setHolidayError('');
    setData({ userId: user.id, employee, manager, items: itemResponse.data?.todayItems || [], metrics: itemResponse.data?.metrics || {}, templates: templateResponse.data || [], employees: employeeResponse.data || [], holidays, employeeLeave });
    if (generationResponse && !generationResponse.success) setError(generationResponse.error || 'Checklist generation failed.');
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const today = getBusinessDate();
  const canManage = Boolean(data?.manager);
  const items = useMemo(() => data?.items || [], [data]);
  const templates = useMemo(() => data?.templates || [], [data]);
  const employees = useMemo(() => data?.employees || [], [data]);
  const holidays = useMemo(() => data?.holidays || [], [data]);
  const employeeLeave = useMemo(() => data?.employeeLeave || [], [data]);
  const todayItems = useMemo(() => items.filter((item) => item.due_date === today && item.status !== 'deactivated'), [items, today]);
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
  function addDate(setDates, value, clear) { if (!value) return; setDates((current) => [...new Set([...current, value])].sort()); clear(''); }
  function openEmployeeLeaveConfig(group = null) { setNonWorkingDayReason('employee_leave'); setLeaveEmployeeId(group?.employeeId || ''); setNonWorkingDayLeaveEditingEmployeeId(group?.employeeId || ''); setLeaveDates(group?.dates || []); setLeaveDateInput(''); setError(''); setNonWorkingDayConfirming(false); const dateValue = group?.dates?.[0] || getChecklistBusinessDate(new Date(), defaultChecklistTimeZone); setNonWorkingDayDate(dateValue); setNonWorkingDayOpen(true); previewNonWorkingDay(dateValue); }
  function openNationalHolidayConfig(group = null) { setNonWorkingDayReason('national_holiday'); setHolidayName(group?.name || ''); setHolidayDates(group?.dates || []); setHolidayDateInput(''); setNonWorkingDayHolidayEditingIds(group?.ids || []); setError(''); setNonWorkingDayConfirming(false); const dateValue = group?.dates?.[0] || getChecklistBusinessDate(new Date(), defaultChecklistTimeZone); setNonWorkingDayDate(dateValue); setNonWorkingDayOpen(true); previewNonWorkingDay(dateValue); }
  function onNonWorkingDayReasonChange(value) { setNonWorkingDayReason(value); setError(''); }
  function removeLeaveDate(dateValue) { setLeaveDates((current) => current.filter((date) => date !== dateValue)); }
  function removeHolidayDate(dateValue) { setHolidayDates((current) => current.filter((date) => date !== dateValue)); }

  async function saveNonWorkingDayConfig() {
    setNonWorkingDayConfigSaving(true); setError('');
    const token = await getAccessToken();
    const body = nonWorkingDayReason === 'employee_leave' ? { reason: 'employee_leave', employee_id: leaveEmployeeId, previous_employee_id: nonWorkingDayLeaveEditingEmployeeId, dates: leaveDates } : { reason: 'national_holiday', name: holidayName.trim(), country: 'India', dates: holidayDates, existing_ids: nonWorkingDayHolidayEditingIds };
    const response = await fetch('/api/checklist/non-working-days', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The non-working-day settings could not be saved.');
    else { setMessage(payload.deactivatedCount ? `Saved and deactivated ${payload.deactivatedCount} checklist task${payload.deactivatedCount === 1 ? '' : 's'}.` : 'Non-working-day settings saved.'); await load(); }
    setNonWorkingDayConfigSaving(false);
  }

  async function removeConfiguredLeaveDate(group, dateValue) {
    const token = await getAccessToken();
    const response = await fetch('/api/checklist/non-working-days', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ reason: 'employee_leave', employee_id: group.employeeId, date: dateValue }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The leave date could not be removed.'); else { setMessage('Non-working date removed.'); await load(); }
  }

  async function removeConfiguredHoliday(group) {
    if (!window.confirm(`Remove ${group.name}?`)) return;
    const token = await getAccessToken();
    const response = await fetch('/api/checklist/non-working-days', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ reason: 'national_holiday', ids: group.ids }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The holiday could not be removed.'); else { setMessage('National holiday removed.'); await load(); }
  }
  function updateHolidayForm(field, value) { setHolidayForm((current) => ({ ...current, [field]: value })); }
  function openHolidayCreate() { setHolidayEditing(null); setHolidayForm({ holiday_date: getChecklistBusinessDate(new Date(), defaultChecklistTimeZone), name: '', country: 'India', is_active: true }); setHolidayError(''); setHolidayModalOpen(true); }
  function openHolidayEdit(holiday) { setHolidayEditing(holiday); setHolidayForm({ holiday_date: holiday.holiday_date, name: holiday.name, country: holiday.country, is_active: holiday.is_active }); setHolidayError(''); setHolidayModalOpen(true); }
  function closeHolidayModal() { setHolidayModalOpen(false); setHolidayEditing(null); setHolidayError(''); }

  async function saveHoliday(event) {
    event.preventDefault();
    setHolidaySaving(true); setHolidayError('');
    const token = await getAccessToken();
    const response = await fetch('/api/checklist/holidays', { method: holidayEditing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(holidayEditing ? { id: holidayEditing.id, ...holidayForm } : holidayForm) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setHolidayError(payload.error || 'The national holiday could not be saved.');
    else { setMessage(holidayEditing ? 'National holiday updated.' : 'National holiday added.'); closeHolidayModal(); await load(); }
    setHolidaySaving(false);
  }

  async function disableHoliday(holiday) {
    if (!window.confirm(`Disable ${holiday.name} on ${formatSelectedDate(holiday.holiday_date)}?`)) return;
    const token = await getAccessToken();
    const response = await fetch('/api/checklist/holidays', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ id: holiday.id }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setHolidayError(payload.error || 'The national holiday could not be disabled.');
    else { setMessage('National holiday disabled.'); await load(); }
  }

  async function previewNonWorkingDay(dateValue) {
    const requestId = nonWorkingDayPreviewRequest.current + 1;
    nonWorkingDayPreviewRequest.current = requestId;
    setNonWorkingDayLoading(true); setNonWorkingDayPreview(null); setError('');
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/checklist/deactivate-non-working-day/preview', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ date: dateValue }) });
      const payload = await response.json().catch(() => ({}));
      if (requestId !== nonWorkingDayPreviewRequest.current) return;
      if (!response.ok) setError(payload.error || 'The non-working-day preview could not be loaded.'); else setNonWorkingDayPreview(payload);
    } catch {
      if (requestId === nonWorkingDayPreviewRequest.current) setError('The non-working-day preview could not be loaded.');
    } finally {
      if (requestId === nonWorkingDayPreviewRequest.current) setNonWorkingDayLoading(false);
    }
  }

  function openNonWorkingDayModal() {
    const dateValue = getChecklistBusinessDate(new Date(), defaultChecklistTimeZone);
    setNonWorkingDayReason('employee_leave'); setLeaveEmployeeId(''); setLeaveDates([]); setLeaveDateInput(''); setHolidayName(''); setHolidayDates([]); setHolidayDateInput(''); setNonWorkingDayLeaveEditingEmployeeId(''); setNonWorkingDayHolidayEditingIds([]); setNonWorkingDayDate(dateValue); setNonWorkingDayConfirming(false); setNonWorkingDayOpen(true); previewNonWorkingDay(dateValue);
  }

  function closeNonWorkingDayModal() { nonWorkingDayPreviewRequest.current += 1; setNonWorkingDayOpen(false); setNonWorkingDayPreview(null); setNonWorkingDayConfirming(false); setError(''); }

  function changeNonWorkingDayDate(event) {
    const dateValue = event.target.value;
    setNonWorkingDayDate(dateValue); setNonWorkingDayConfirming(false); previewNonWorkingDay(dateValue);
  }

  async function applyNonWorkingDayDeactivation() {
    if (!nonWorkingDayPreview || !nonWorkingDayConfirming) return;
    setNonWorkingDaySaving(true); setError('');
    const token = await getAccessToken();
    const response = await fetch('/api/checklist/deactivate-non-working-day', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ date: nonWorkingDayDate }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The checklist tasks could not be deactivated.');
    else { setMessage(payload.deactivatedCount ? `${payload.deactivatedCount} checklist task${payload.deactivatedCount === 1 ? '' : 's'} deactivated.` : 'No active checklist tasks need to be deactivated for this date.'); closeNonWorkingDayModal(); await load(); }
    setNonWorkingDaySaving(false);
  }

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

  async function softDelete(template) {
    if (!window.confirm('Delete this checklist template? Existing generated history will remain available.')) return;
    const token = await getAccessToken();
    const response = await fetch('/api/checklist/templates', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ id: template.id, employee_id: template.employee_id, task: template.task, frequency: template.frequency, weekday: template.weekday, day_of_month: template.day_of_month, monthly_days: template.monthly_days || [], start_date: template.start_date, due_time: template.due_time?.slice(0, 5), active: false }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The checklist template could not be deactivated.'); else { setMessage('Checklist deactivated.'); await load(); }
  }

  async function completeItem(item) {
    if (completing || getChecklistStatus(item) === 'completed') return;
    setCompleting(item.id); setError('');
    const { error: updateError } = await setChecklistCompletion(item.id);
    if (updateError) setError(updateError.message); else { setMessage('Checklist item completed.'); await load(); }
    setCompleting(null);
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
    if (!window.confirm(`Delete ${selectedIds.length} checklist templates?\n\nGenerated checklist items will remain unchanged.`)) return;
    const token = await getAccessToken();
    const response = await fetch('/api/checklist/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ ids: selectedIds }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The selected templates could not be deactivated.'); else { setMessage(`${payload.deleted} checklist templates deactivated.`); clearSelection(); await load(); }
  }

  const canUseNonWorkingDay = Boolean(data && canDeactivateNonWorkingDayTasks(data.employee.role));
  const titleAction = canManage ? <>{canUseNonWorkingDay && <button className="button button-ghost" type="button" onClick={openNonWorkingDayModal}><Icon name="calendar" size={17} />Deactivate Non-Working-Day Tasks</button>}<button className="button button-ghost" type="button" onClick={openImport}><Icon name="upload" size={17} />Import XLSX</button><button className="button button-primary" type="button" onClick={openCreate}><Icon name="plus" size={17} />Add checklist</button></> : null;
  return <AppShell title="Checklist" eyebrow="Workspace / Checklist" description="Manage recurring daily, weekly, and monthly work for employees." actions={titleAction}>
    {message && <div className="inline-alert success"><Icon name="checkCircle" size={16} />{message}</div>}
    {error && !modalOpen && !importOpen && !bulkOpen && !nonWorkingDayOpen && <div className="inline-alert error" role="alert"><Icon name="warning" size={16} />{error}<button className="button button-ghost button-small" type="button" onClick={load}>Try again</button></div>}
    {loading ? <section className="panel checklist-loading"><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /></section> : canManage ? <>
      <section className="task-summary-row checklist-summary"><div className="inline-stat"><span className="inline-stat-icon blue"><Icon name="list" size={16} /></span><div><strong>{templates.length}</strong><span>Templates</span></div></div><div className="inline-stat"><span className="inline-stat-icon purple"><Icon name="calendar" size={16} /></span><div><strong>{todayItems.length}</strong><span>Today&apos;s items</span></div></div><div className="inline-stat"><span className="inline-stat-icon orange"><Icon name="warning" size={16} /></span><div><strong>{data.metrics?.overdue || 0}</strong><span>Overdue</span></div></div><div className="inline-stat"><span className="inline-stat-icon mint"><Icon name="checkCircle" size={16} /></span><div><strong>{data.metrics?.completed || 0}</strong><span>Completed</span></div></div></section>
      <section className="panel checklist-panel"><SectionHeader eyebrow="Recurring work" title="Checklist templates" description="Set the recurring rule once. Scheduled items are generated automatically when due." />
        <div className="filter-bar checklist-template-filters"><label className="search-box"><Icon name="search" size={17} /><input aria-label="Search checklist templates" placeholder="Search employees or tasks" value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} /></label><label className="filter-control"><span>Employee</span><select value={templateEmployeeFilter} onChange={(event) => setTemplateEmployeeFilter(event.target.value)}><option value="all">All employees</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></label><label className="filter-control"><span>Frequency</span><select value={templateFrequencyFilter} onChange={(event) => setTemplateFrequencyFilter(event.target.value)}><option value="all">All frequencies</option>{checklistFrequencies.map((frequency) => <option value={frequency.value} key={frequency.value}>{frequency.label}</option>)}</select></label><label className="filter-control"><span>Status</span><select value={templateStatusFilter} onChange={(event) => setTemplateStatusFilter(event.target.value)}><option value="all">All status</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div>
        {selectedIds.length > 0 && <div className="checklist-bulk-toolbar"><strong>{selectedIds.length} selected</strong><button className="button button-ghost button-small" type="button" onClick={openBulkEdit}>Edit selected</button><button className="button button-ghost button-small" type="button" onClick={bulkDelete}>Delete selected</button><button className="button button-ghost button-small" type="button" onClick={clearSelection}>Clear selection</button></div>}
        {templates.length ? <div className="checklist-table-scroll"><div className="checklist-table-heading"><span className="checklist-selection-header"><input type="checkbox" aria-label="Select all visible checklist templates" checked={allVisibleSelected} onChange={toggleVisibleSelection} /></span><span>Employee ID</span><span>Name</span><span>Task</span><span>Days</span><span>Status</span><span /></div><div className="checklist-template-list">{filteredTemplates.map((template) => <div className="checklist-template-row" key={template.id}><span className="checklist-selection"><input type="checkbox" aria-label={`Select ${template.task}`} checked={selectedIds.includes(template.id)} onChange={() => toggleSelected(template.id)} /></span><div className="checklist-employee-id"><strong>{formatEmployeeId(template.employee_id)}</strong><small>{template.employee?.email || 'Workspace employee'}</small></div><strong className="checklist-employee-name">{template.employee?.name || 'Unknown employee'}</strong><span className="checklist-task-name">{template.task}</span><span className="checklist-days"><Icon name="calendar" size={14} /><span>{formatChecklistDays(template)}<small>{formatChecklistTime(template.due_time)}</small></span></span><span className={`access-pill ${template.active ? 'active' : 'inactive'}`}><span />{template.active ? 'Active' : 'Inactive'}</span><details className="checklist-actions"><summary aria-label={`Actions for ${template.task}`}><Icon name="more" size={17} /></summary><div className="checklist-actions-menu"><button type="button" onClick={() => openEdit(template)}><Icon name="edit" size={14} />Edit</button><button type="button" onClick={() => deactivate(template)}><Icon name={template.active ? 'close' : 'check'} size={14} />{template.active ? 'Deactivate' : 'Activate'}</button><button type="button" onClick={() => softDelete(template)}><Icon name="close" size={14} />Delete</button></div></details></div>)}</div></div> : <EmptyState icon="checkSquare" title="No checklist tasks yet" description="Create recurring work for your employees to keep daily operations on track." action="Add checklist" onAction={openCreate} />}</section>
      {canUseNonWorkingDay && <section className="panel checklist-panel"><SectionHeader eyebrow="Calendar" title="National holidays" description="Manage active holiday records used by the non-working-day checklist preview." action={<button className="button button-ghost button-small" type="button" onClick={openHolidayCreate}><Icon name="plus" size={15} />Add holiday</button>} />{holidayError && <div className="inline-alert error" role="alert"><Icon name="warning" size={16} />{holidayError}</div>}{holidays.length ? <div className="holiday-list">{holidays.map((holiday) => <div className="holiday-row" key={holiday.id}><div><strong>{holiday.name}</strong><span>{formatSelectedDate(holiday.holiday_date)} · {holiday.country}</span></div><span className={`access-pill ${holiday.is_active ? 'active' : 'inactive'}`}><span />{holiday.is_active ? 'Enabled' : 'Disabled'}</span><div className="holiday-actions"><button className="button button-ghost button-small" type="button" onClick={() => openHolidayEdit(holiday)}>Edit</button>{holiday.is_active && <button className="button button-ghost button-small" type="button" onClick={() => disableHoliday(holiday)}>Disable</button>}</div></div>)}</div> : <EmptyState compact icon="calendar" title="No national holidays configured" description="Add a holiday record to make it available to non-working-day previews." action="Add holiday" onAction={openHolidayCreate} />}</section>}
    </> : <section className="panel checklist-doer-panel"><SectionHeader eyebrow="Today" title="Today&apos;s checklist" description="Complete your recurring work as you finish it. Status is updated automatically." />{todayItems.length ? <div className="checklist-item-list">{todayItems.map((item) => <ChecklistItemCard item={item} key={item.id} onComplete={completeItem} completing={completing === item.id} />)}</div> : <EmptyState icon="checkCircle" title="You&apos;re all caught up" description="No checklist items are due today." />}</section>}
    {canManage && <Modal open={modalOpen} title={editing ? 'Edit checklist' : 'Add checklist'} description="Create a recurring rule for one employee. Generated history stays unchanged when you edit the rule." onClose={closeModal} wide><form className="modal-form" onSubmit={save}><div className="form-grid form-grid-two"><div className="field field-wide"><label htmlFor="checklist-employee">Employee<span>*</span></label><select id="checklist-employee" className="input" required value={form.employee_id} onChange={(event) => updateForm('employee_id', event.target.value)}><option value="">Choose an employee</option>{employees.filter((employee) => employee.active).map((employee) => <option value={employee.id} key={employee.id}>{formatEmployeeId(employee.id)} — {employee.name}</option>)}</select></div><div className="field field-wide"><label htmlFor="checklist-task">Task<span>*</span></label><input id="checklist-task" className="input" required maxLength="240" placeholder="e.g. Check daily sales report" value={form.task} onChange={(event) => updateForm('task', event.target.value)} /></div><div className="field"><label htmlFor="checklist-frequency">Frequency<span>*</span></label><select id="checklist-frequency" className="input" required value={form.frequency} onChange={(event) => updateForm('frequency', event.target.value)}>{checklistFrequencies.map((frequency) => <option value={frequency.value} key={frequency.value}>{frequency.label}</option>)}</select></div><div className="field"><label htmlFor="checklist-start-date">Start/assign date<span>*</span></label><input id="checklist-start-date" className="input" type="date" required value={form.start_date} onChange={(event) => updateForm('start_date', event.target.value)} /></div>{form.frequency === 'weekly' && <div className="field"><label htmlFor="checklist-weekday">Day of week<span>*</span></label><select id="checklist-weekday" className="input" required value={form.weekday} onChange={(event) => updateForm('weekday', event.target.value)}>{checklistWeekdays.map((weekday, index) => <option value={index} key={weekday}>{weekday}</option>)}</select></div>}{form.frequency === 'monthly' && <div className="field"><label htmlFor="checklist-monthly-days">Days of month<span>*</span></label><select id="checklist-monthly-days" className="input" multiple required value={form.monthly_days} onChange={(event) => handleMonthlyDays(event, (days) => setForm((current) => ({ ...current, monthly_days: days })))}>{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option value={String(day)} key={day}>{day}</option>)}</select><small className="field-help">Hold Ctrl/Cmd to choose multiple days. Short months use the last available day.</small></div>}<div className="field"><label htmlFor="checklist-due-time">Due time<span>*</span></label><input id="checklist-due-time" className="input" type="time" required value={form.due_time} onChange={(event) => updateForm('due_time', event.target.value)} /></div><label className="checkbox-field field-wide"><input type="checkbox" checked={form.active} onChange={(event) => updateForm('active', event.target.checked)} /><span><strong>Active</strong><small>Deactivate recurring work without deleting its generated history.</small></span></label></div>{error && modalOpen && <div className="form-error"><Icon name="warning" size={16} />{error}</div>}<div className="modal-actions"><button className="button button-ghost" type="button" onClick={closeModal}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Add checklist'}{!saving && <Icon name="arrowUpRight" size={16} />}</button></div></form></Modal>}
    {canUseNonWorkingDay && <section className="panel checklist-panel non-working-day-settings"><SectionHeader eyebrow="Calendar" title="Non-working day settings" description="Sunday is automatic. Add employee leave dates or national holidays here." action={<div className="non-working-day-settings-actions"><button className="button button-ghost button-small" type="button" onClick={() => openEmployeeLeaveConfig()}><Icon name="plus" size={15} />Employee Leave</button><button className="button button-ghost button-small" type="button" onClick={() => openNationalHolidayConfig()}><Icon name="plus" size={15} />National Holiday</button></div>} /><div className="configured-non-working-days">{employeeLeave.flatMap((group) => group.dates.map((dateValue) => <div className="configured-non-working-day-row" key={`${group.employeeId}-${dateValue}`}><div><strong>{formatSelectedDate(dateValue)}</strong><span>Employee Leave · {group.employee?.name || formatEmployeeId(group.employeeId)}</span></div><div className="holiday-actions"><button className="button button-ghost button-small" type="button" onClick={() => openEmployeeLeaveConfig(group)}>Edit</button><button className="button button-ghost button-small" type="button" onClick={() => removeConfiguredLeaveDate(group, dateValue)}>Remove</button></div></div>))}{holidays.flatMap((group) => group.dates.map((dateValue) => <div className="configured-non-working-day-row" key={`${group.key}-${dateValue}`}><div><strong>{formatSelectedDate(dateValue)}</strong><span>National Holiday · {group.name}</span></div><div className="holiday-actions"><button className="button button-ghost button-small" type="button" onClick={() => openNationalHolidayConfig(group)}>Edit</button><button className="button button-ghost button-small" type="button" onClick={() => removeConfiguredHoliday(group)}>Remove</button></div></div>))}</div>{!employeeLeave.length && !holidays.length && <EmptyState compact icon="calendar" title="No configured non-working dates" description="Sundays are detected automatically." />}</section>}
    <ImportModal open={importOpen} onClose={closeImport} startDate={importStartDate} setStartDate={setImportStartDate} file={importFile} setFile={setImportFile} preview={importPreview} result={importResult} allowDuplicates={importAllowDuplicates} setAllowDuplicates={setImportAllowDuplicates} loading={importLoading} error={error} onPreview={previewImport} onImport={importTasks} onReset={resetImport} />
    <BulkEditModal open={bulkOpen} onClose={closeBulk} selectedCount={selectedIds.length} values={bulkValues} setValues={setBulkValues} fields={bulkFields} setFields={setBulkFields} review={bulkReview} setReview={setBulkReview} loading={bulkLoading} error={error} onApply={applyBulkChanges} />
    {canUseNonWorkingDay && <NationalHolidayModal open={holidayModalOpen} editing={holidayEditing} form={holidayForm} onChange={updateHolidayForm} onClose={closeHolidayModal} onSave={saveHoliday} saving={holidaySaving} error={holidayError} />}
    {canUseNonWorkingDay && <NonWorkingDayModal open={nonWorkingDayOpen} simple simpleProps={{ open: nonWorkingDayOpen, reason: nonWorkingDayReason, onReasonChange: onNonWorkingDayReasonChange, date: nonWorkingDayDate, onDateChange: changeNonWorkingDayDate, leaveWorkingEmployees: employees.filter((employee) => employee.active), leaveEmployeeId, onLeaveEmployeeChange: setLeaveEmployeeId, leaveDates, leaveDateInput, onLeaveDateInputChange: (event) => setLeaveDateInput(event.target.value), onAddLeaveDate: () => addDate(setLeaveDates, leaveDateInput, setLeaveDateInput), onRemoveLeaveDate: removeLeaveDate, holidayName, onHolidayNameChange: setHolidayName, holidayDates, holidayDateInput, onHolidayDateInputChange: (event) => setHolidayDateInput(event.target.value), onAddHolidayDate: () => addDate(setHolidayDates, holidayDateInput, setHolidayDateInput), onRemoveHolidayDate: removeHolidayDate, onSaveConfig: saveNonWorkingDayConfig, configSaving: nonWorkingDayConfigSaving, loading: nonWorkingDayLoading, preview: nonWorkingDayPreview, error, confirming: nonWorkingDayConfirming, onConfirm: () => setNonWorkingDayConfirming(true), onCancelConfirm: () => setNonWorkingDayConfirming(false), onApply: applyNonWorkingDayDeactivation, saving: nonWorkingDaySaving, onClose: closeNonWorkingDayModal }} />}
  </AppShell>;
}
