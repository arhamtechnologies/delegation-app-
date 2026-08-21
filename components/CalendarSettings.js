'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';
import { EmptyState, Modal, SectionHeader } from './UI';
import { getAccessToken, getCurrentEmployee } from '../lib/auth';
import { canDeactivateNonWorkingDayTasks, formatEmployeeId } from '../lib/checklist-data';
import { defaultChecklistTimeZone, formatChecklistDueAt, getChecklistBusinessDate } from '../lib/checklist-time';
import { supabaseBrowser } from '../lib/supabase-browser';

function formatSelectedDate(value) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`));
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

export default function CalendarSettings() {
  const [employee, setEmployee] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [employeeLeave, setEmployeeLeave] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [holidayError, setHolidayError] = useState('');
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [holidayEditing, setHolidayEditing] = useState(null);
  const [holidayForm, setHolidayForm] = useState({ holiday_date: getChecklistBusinessDate(new Date(), defaultChecklistTimeZone), name: '', country: 'India', is_active: true });
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [nonWorkingDayOpen, setNonWorkingDayOpen] = useState(false);
  const [nonWorkingDayDate, setNonWorkingDayDate] = useState(getChecklistBusinessDate(new Date(), defaultChecklistTimeZone));
  const [nonWorkingDayPreview, setNonWorkingDayPreview] = useState(null);
  const [nonWorkingDayLoading, setNonWorkingDayLoading] = useState(false);
  const [nonWorkingDaySaving, setNonWorkingDaySaving] = useState(false);
  const [nonWorkingDayConfirming, setNonWorkingDayConfirming] = useState(false);
  const nonWorkingDayPreviewRequest = useRef(0);
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

  async function load() {
    setLoading(true); setError('');
    const { user, employee: currentEmployee, error: employeeError } = await getCurrentEmployee();
    if (!user) { setLoading(false); return; }
    if (employeeError || !currentEmployee) { setError('Unable to load your workspace profile. Please try again.'); setLoading(false); return; }
    setEmployee(currentEmployee);
    if (!canDeactivateNonWorkingDayTasks(currentEmployee.role)) { setLoading(false); return; }
    const token = await getAccessToken();
    const [configResult, employeeResult] = await Promise.all([
      fetch('/api/checklist/non-working-days', { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(async (response) => ({ response, payload: await response.json().catch(() => ({})) })),
      supabaseBrowser().from('employees').select('id,name,email,active,role').order('name'),
    ]);
    if (!configResult.response.ok) setError(configResult.payload.error || 'Calendar settings could not be loaded.');
    else { setHolidays(configResult.payload.holidays || []); setEmployeeLeave(configResult.payload.employeeLeave || []); }
    if (employeeResult.error) setError('Employees could not be loaded for leave configuration.');
    else setEmployees(employeeResult.data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function addDate(setDates, value, clear) { if (!value) return; setDates((current) => [...new Set([...current, value])].sort()); clear(''); }
  function openEmployeeLeaveConfig(group = null) { setNonWorkingDayReason('employee_leave'); setLeaveEmployeeId(group?.employeeId || ''); setNonWorkingDayLeaveEditingEmployeeId(group?.employeeId || ''); setLeaveDates(group?.dates || []); setLeaveDateInput(''); setError(''); setNonWorkingDayConfirming(false); const dateValue = group?.dates?.[0] || getChecklistBusinessDate(new Date(), defaultChecklistTimeZone); setNonWorkingDayDate(dateValue); setNonWorkingDayOpen(true); previewNonWorkingDay(dateValue); }
  function openNationalHolidayConfig(group = null) { setNonWorkingDayReason('national_holiday'); setHolidayName(group?.name || ''); setHolidayDates(group?.dates || []); setHolidayDateInput(''); setNonWorkingDayHolidayEditingIds(group?.ids || []); setError(''); setNonWorkingDayConfirming(false); const dateValue = group?.dates?.[0] || getChecklistBusinessDate(new Date(), defaultChecklistTimeZone); setNonWorkingDayDate(dateValue); setNonWorkingDayOpen(true); previewNonWorkingDay(dateValue); }
  function removeLeaveDate(dateValue) { setLeaveDates((current) => current.filter((date) => date !== dateValue)); }
  function removeHolidayDate(dateValue) { setHolidayDates((current) => current.filter((date) => date !== dateValue)); }

  async function saveNonWorkingDayConfig() {
    setNonWorkingDayConfigSaving(true); setError('');
    const token = await getAccessToken();
    const body = nonWorkingDayReason === 'employee_leave' ? { reason: 'employee_leave', employee_id: leaveEmployeeId, previous_employee_id: nonWorkingDayLeaveEditingEmployeeId, dates: leaveDates } : { reason: 'national_holiday', name: holidayName.trim(), country: 'India', dates: holidayDates, existing_ids: nonWorkingDayHolidayEditingIds };
    const response = await fetch('/api/checklist/non-working-days', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The non-working-day settings could not be saved.');
    else { setMessage(payload.deactivatedCount && payload.restoredCount ? `Saved, deactivated ${payload.deactivatedCount} and restored ${payload.restoredCount} checklist task${payload.restoredCount === 1 ? '' : 's'}.` : payload.deactivatedCount ? `Saved and deactivated ${payload.deactivatedCount} checklist task${payload.deactivatedCount === 1 ? '' : 's'}.` : payload.restoredCount ? `Saved and restored ${payload.restoredCount} checklist task${payload.restoredCount === 1 ? '' : 's'}.` : 'Non-working-day settings saved.'); await load(); }
    setNonWorkingDayConfigSaving(false);
  }

  async function removeConfiguredLeaveDate(group, dateValue) {
    const token = await getAccessToken();
    const response = await fetch('/api/checklist/non-working-days', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ reason: 'employee_leave', employee_id: group.employeeId, date: dateValue }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The leave date could not be removed.'); else { setMessage(payload.restoredCount ? `Non-working date removed. Restored ${payload.restoredCount} checklist task${payload.restoredCount === 1 ? '' : 's'}.` : 'Non-working date removed.'); await load(); }
  }

  function updateHolidayForm(field, value) { setHolidayForm((current) => ({ ...current, [field]: value })); }
  function openHolidayCreate() { setHolidayEditing(null); setHolidayForm({ holiday_date: getChecklistBusinessDate(new Date(), defaultChecklistTimeZone), name: '', country: 'India', is_active: true }); setHolidayError(''); setHolidayModalOpen(true); }
  function openHolidayEdit(holiday) { setHolidayEditing(holiday); setHolidayForm({ holiday_date: holiday.holiday_date, name: holiday.name, country: holiday.country, is_active: holiday.is_active }); setHolidayError(''); setHolidayModalOpen(true); }
  function closeHolidayModal() { setHolidayModalOpen(false); setHolidayEditing(null); setHolidayError(''); }

  async function saveHoliday(event) {
    event.preventDefault(); setHolidaySaving(true); setHolidayError('');
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
    if (!response.ok) setHolidayError(payload.error || 'The national holiday could not be disabled.'); else { setMessage('National holiday disabled.'); await load(); }
  }

  async function previewNonWorkingDay(dateValue) {
    const requestId = nonWorkingDayPreviewRequest.current + 1;
    nonWorkingDayPreviewRequest.current = requestId; setNonWorkingDayLoading(true); setNonWorkingDayPreview(null); setError('');
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/checklist/deactivate-non-working-day/preview', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ date: dateValue }) });
      const payload = await response.json().catch(() => ({}));
      if (requestId !== nonWorkingDayPreviewRequest.current) return;
      if (!response.ok) setError(payload.error || 'The non-working-day preview could not be loaded.'); else setNonWorkingDayPreview(payload);
    } catch { if (requestId === nonWorkingDayPreviewRequest.current) setError('The non-working-day preview could not be loaded.'); }
    finally { if (requestId === nonWorkingDayPreviewRequest.current) setNonWorkingDayLoading(false); }
  }

  function openNonWorkingDayModal() {
    const dateValue = getChecklistBusinessDate(new Date(), defaultChecklistTimeZone);
    setNonWorkingDayReason('employee_leave'); setLeaveEmployeeId(''); setLeaveDates([]); setLeaveDateInput(''); setHolidayName(''); setHolidayDates([]); setHolidayDateInput(''); setNonWorkingDayLeaveEditingEmployeeId(''); setNonWorkingDayHolidayEditingIds([]); setNonWorkingDayDate(dateValue); setNonWorkingDayConfirming(false); setNonWorkingDayOpen(true); previewNonWorkingDay(dateValue);
  }

  function closeNonWorkingDayModal() { nonWorkingDayPreviewRequest.current += 1; setNonWorkingDayOpen(false); setNonWorkingDayPreview(null); setNonWorkingDayConfirming(false); setError(''); }
  function changeNonWorkingDayDate(event) { const dateValue = event.target.value; setNonWorkingDayDate(dateValue); setNonWorkingDayConfirming(false); previewNonWorkingDay(dateValue); }

  async function applyNonWorkingDayDeactivation() {
    if (!nonWorkingDayPreview || !nonWorkingDayConfirming) return;
    setNonWorkingDaySaving(true); setError('');
    const token = await getAccessToken();
    const response = await fetch('/api/checklist/deactivate-non-working-day', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ date: nonWorkingDayDate }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The checklist tasks could not be deactivated.'); else { setMessage(payload.deactivatedCount ? `${payload.deactivatedCount} checklist task${payload.deactivatedCount === 1 ? '' : 's'} deactivated.` : 'No active checklist tasks need to be deactivated for this date.'); closeNonWorkingDayModal(); await load(); }
    setNonWorkingDaySaving(false);
  }

  if (loading) return <section className="panel checklist-loading"><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /></section>;
  if (!employee || !canDeactivateNonWorkingDayTasks(employee.role)) return <section className="panel"><EmptyState icon="calendar" title="Calendar settings unavailable" description="You do not have permission to manage workspace calendars." /></section>;

  return <>
    {message && <div className="inline-alert success"><Icon name="checkCircle" size={16} />{message}</div>}
    {error && !nonWorkingDayOpen && <div className="inline-alert error" role="alert"><Icon name="warning" size={16} />{error}<button className="button button-ghost button-small" type="button" onClick={load}>Try again</button></div>}
    <section className="panel checklist-panel"><SectionHeader eyebrow="Calendar" title="National holidays" description="Manage active holiday records used by the non-working-day checklist preview." action={<button className="button button-ghost button-small" type="button" onClick={openHolidayCreate}><Icon name="plus" size={15} />Add holiday</button>} />{holidayError && <div className="inline-alert error" role="alert"><Icon name="warning" size={16} />{holidayError}</div>}{holidays.length ? <div className="holiday-list">{holidays.map((holiday) => <div className="holiday-row" key={holiday.id}><div><strong>{holiday.name}</strong><span>{formatSelectedDate(holiday.holiday_date)} · {holiday.country}</span></div><span className={`access-pill ${holiday.is_active ? 'active' : 'inactive'}`}><span />{holiday.is_active ? 'Enabled' : 'Disabled'}</span><div className="holiday-actions"><button className="button button-ghost button-small" type="button" onClick={() => openHolidayEdit(holiday)}>Edit</button>{holiday.is_active && <button className="button button-ghost button-small" type="button" onClick={() => disableHoliday(holiday)}>Disable</button>}</div></div>)}</div> : <EmptyState compact icon="calendar" title="No national holidays configured" description="Add a holiday record to make it available to non-working-day previews." action="Add holiday" onAction={openHolidayCreate} />}</section>
    <section className="panel checklist-panel non-working-day-settings"><SectionHeader eyebrow="Calendar" title="Non-working day settings" description="Sunday is automatic. Add employee leave dates or national holidays here." action={<div className="non-working-day-settings-actions"><button className="button button-ghost button-small" type="button" onClick={openNonWorkingDayModal}><Icon name="calendar" size={15} />Deactivate checklist tasks</button><button className="button button-ghost button-small" type="button" onClick={() => openEmployeeLeaveConfig()}><Icon name="plus" size={15} />Employee Leave</button><button className="button button-ghost button-small" type="button" onClick={() => openNationalHolidayConfig()}><Icon name="plus" size={15} />National Holiday</button></div>} /><div className="configured-non-working-days">{employeeLeave.flatMap((group) => group.dates.map((dateValue) => <div className="configured-non-working-day-row" key={`${group.employeeId}-${dateValue}`}><div><strong>{formatSelectedDate(dateValue)}</strong><span>Employee Leave · {group.employee?.name || formatEmployeeId(group.employeeId)}</span></div><div className="holiday-actions"><button className="button button-ghost button-small" type="button" onClick={() => openEmployeeLeaveConfig(group)}>Edit</button><button className="button button-ghost button-small" type="button" onClick={() => removeConfiguredLeaveDate(group, dateValue)}>Remove</button></div></div>))}</div>{!employeeLeave.length && <EmptyState compact icon="calendar" title="No employee leave dates configured" description="National holidays are listed above. Sundays are detected automatically." />}</section>
    <NationalHolidayModal open={holidayModalOpen} editing={holidayEditing} form={holidayForm} onChange={updateHolidayForm} onClose={closeHolidayModal} onSave={saveHoliday} saving={holidaySaving} error={holidayError} />
    <SimpleNonWorkingDayModal open={nonWorkingDayOpen} reason={nonWorkingDayReason} onReasonChange={setNonWorkingDayReason} date={nonWorkingDayDate} onDateChange={changeNonWorkingDayDate} leaveWorkingEmployees={employees.filter((item) => item.active)} leaveEmployeeId={leaveEmployeeId} onLeaveEmployeeChange={setLeaveEmployeeId} leaveDates={leaveDates} leaveDateInput={leaveDateInput} onLeaveDateInputChange={(event) => setLeaveDateInput(event.target.value)} onAddLeaveDate={() => addDate(setLeaveDates, leaveDateInput, setLeaveDateInput)} onRemoveLeaveDate={removeLeaveDate} holidayName={holidayName} onHolidayNameChange={setHolidayName} holidayDates={holidayDates} holidayDateInput={holidayDateInput} onHolidayDateInputChange={(event) => setHolidayDateInput(event.target.value)} onAddHolidayDate={() => addDate(setHolidayDates, holidayDateInput, setHolidayDateInput)} onRemoveHolidayDate={removeHolidayDate} onSaveConfig={saveNonWorkingDayConfig} configSaving={nonWorkingDayConfigSaving} loading={nonWorkingDayLoading} preview={nonWorkingDayPreview} error={error} confirming={nonWorkingDayConfirming} onConfirm={() => setNonWorkingDayConfirming(true)} onCancelConfirm={() => setNonWorkingDayConfirming(false)} onApply={applyNonWorkingDayDeactivation} saving={nonWorkingDaySaving} onClose={closeNonWorkingDayModal} />
  </>;
}
