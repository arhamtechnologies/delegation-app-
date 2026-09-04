'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { EmptyState, Modal, SectionHeader } from './UI';
import { getAccessToken, getCurrentEmployee } from '../lib/auth';
import { canDeactivateNonWorkingDayTasks, formatEmployeeId } from '../lib/checklist-data';
import { defaultChecklistTimeZone, getChecklistBusinessDate } from '../lib/checklist-time';
import { supabaseBrowser } from '../lib/supabase-browser';

function formatSelectedDate(value) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`));
}

function getEmployeeName(group) {
  return group.employee?.name || formatEmployeeId(group.employeeId);
}

function getEmployeeInitials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '—';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function getEmployeeLeaveEntries(groups, predicate = () => true) {
  return groups.flatMap((group) => group.dates.filter(predicate).map((dateValue) => ({ group, dateValue, employeeName: getEmployeeName(group) })));
}

function sortTodayLeaveEntries(entries) {
  return [...entries].sort((left, right) => left.employeeName.localeCompare(right.employeeName, undefined, { sensitivity: 'base' }));
}

function sortEarlierLeaveEntries(entries) {
  return [...entries].sort((left, right) => {
    const dateDifference = right.dateValue.localeCompare(left.dateValue);
    if (dateDifference) return dateDifference;
    return left.employeeName.localeCompare(right.employeeName, undefined, { sensitivity: 'base' });
  });
}

function formatTodayDate(value) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`));
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

function EmployeeLeaveModal({ open, leaveWorkingEmployees, leaveEmployeeId, onLeaveEmployeeChange, leaveDates, leaveDateInput, onLeaveDateInputChange, onAddLeaveDate, onRemoveLeaveDate, onSave, saving, error, onClose }) {
  if (!open) return null;
  return <Modal open={open} title="Employee Leave" description="Select an employee and the dates they will be away." onClose={onClose}>
    <div className="non-working-day-form">
      <div className="field"><label htmlFor="non-working-day-reason">Reason<span>*</span></label><div id="non-working-day-reason" className="input employee-leave-reason" aria-readonly="true">Employee Leave</div></div>
      <section className="non-working-day-config"><div className="field"><label htmlFor="non-working-day-employee">Employee<span>*</span></label><select id="non-working-day-employee" className="input" value={leaveEmployeeId} onChange={(event) => onLeaveEmployeeChange(event.target.value)}><option value="">Select employee</option>{leaveWorkingEmployees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}</select></div><div className="field"><label htmlFor="non-working-day-leave-date">Dates<span>*</span></label><div className="non-working-day-add-date"><input id="non-working-day-leave-date" className="input" type="date" value={leaveDateInput} onChange={onLeaveDateInputChange} /><button className="button button-ghost button-small" type="button" onClick={onAddLeaveDate}>+ Add date</button></div><DateChips dates={leaveDates} onRemove={onRemoveLeaveDate} /></div><button className="button button-primary" type="button" onClick={onSave} disabled={saving || !leaveEmployeeId || !leaveDates.length}>{saving ? 'Saving...' : 'Save leave dates'}</button></section>
      {error && <div className="form-error" role="alert"><Icon name="warning" size={16} />{error}</div>}
    </div>
  </Modal>;
}

function EarlierLeaveModal({ open, entries, totalCount, search, fromDate, toDate, showAll, onSearchChange, onFromDateChange, onToDateChange, onClearFilters, onViewAll, onEdit, onRemove, onClose }) {
  if (!open) return null;
  const visibleEntries = showAll ? entries : entries.slice(0, 5);
  return <Modal open={open} wide title="Earlier leave records" description="View and manage past employee non-working days." onClose={onClose}>
    <div className="earlier-leave-toolbar">
      <label className="earlier-leave-search"><Icon name="search" size={15} /><span className="sr-only">Search employee</span><input type="search" placeholder="Search employee..." value={search} onChange={(event) => onSearchChange(event.target.value)} /></label>
      <div className="earlier-leave-date-filter"><label>From<input className="input" type="date" value={fromDate} onChange={(event) => onFromDateChange(event.target.value)} /></label><label>To<input className="input" type="date" value={toDate} onChange={(event) => onToDateChange(event.target.value)} /></label><button className="button button-ghost button-small" type="button" onClick={onClearFilters} disabled={!search && !fromDate && !toDate}>Clear</button></div>
    </div>
    <div className="earlier-leave-summary"><strong>Earlier leave records <span>{totalCount}</span></strong>{entries.length !== totalCount && <small>{entries.length} matching {entries.length === 1 ? 'record' : 'records'}</small>}</div>
    {visibleEntries.length ? <div className="earlier-leave-table" role="table" aria-label="Earlier leave records">
      <div className="earlier-leave-table-heading" role="row"><span>Employee</span><span>From</span><span>To</span><span>Days</span><span>Leave type</span><span>Actions</span></div>
      <div className="earlier-leave-table-body">{visibleEntries.map(({ group, dateValue, employeeName }) => <div className="earlier-leave-row" role="row" key={`${group.employeeId}-${dateValue}`}><div className="earlier-leave-employee" data-label="Employee"><span className="employee-leave-avatar" aria-hidden="true">{getEmployeeInitials(employeeName)}</span><strong>{employeeName}</strong></div><span data-label="From">{formatSelectedDate(dateValue)}</span><span data-label="To">{formatSelectedDate(dateValue)}</span><span data-label="Days">1</span><span className="earlier-leave-type" data-label="Leave type">Employee Leave</span><div className="earlier-leave-actions" data-label="Actions"><button className="button button-ghost button-small" type="button" onClick={() => onEdit({ group, dateValue })}>Edit</button><button className="button button-ghost button-small" type="button" onClick={() => onRemove(group, dateValue)}>Remove</button></div></div>)}</div>
    </div> : <div className="earlier-leave-empty"><Icon name="search" size={18} /><strong>No earlier leave found</strong><span>Try a different employee or date range.</span></div>}
    {!showAll && entries.length > visibleEntries.length && <button className="button button-ghost button-small earlier-leave-view-all" type="button" onClick={onViewAll}>View all earlier leave <span>({entries.length})</span><Icon name="chevronDown" size={14} /></button>}
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
  const [employeeLeaveModalOpen, setEmployeeLeaveModalOpen] = useState(false);
  const [earlierLeaveOpen, setEarlierLeaveOpen] = useState(false);
  const [earlierLeaveSearch, setEarlierLeaveSearch] = useState('');
  const [earlierLeaveFromDate, setEarlierLeaveFromDate] = useState('');
  const [earlierLeaveToDate, setEarlierLeaveToDate] = useState('');
  const [showAllEarlierLeave, setShowAllEarlierLeave] = useState(false);
  const [leaveEmployeeId, setLeaveEmployeeId] = useState('');
  const [leaveDates, setLeaveDates] = useState([]);
  const [leaveDateInput, setLeaveDateInput] = useState('');
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [leaveEditingEmployeeId, setLeaveEditingEmployeeId] = useState('');

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
  function openEmployeeLeaveConfig(group = null) { setLeaveEmployeeId(group?.employeeId || ''); setLeaveEditingEmployeeId(group?.employeeId || ''); setLeaveDates(group?.dates || []); setLeaveDateInput(''); setError(''); setEmployeeLeaveModalOpen(true); }
  function removeLeaveDate(dateValue) { setLeaveDates((current) => current.filter((date) => date !== dateValue)); }

  async function saveEmployeeLeave() {
    setLeaveSaving(true); setError('');
    const token = await getAccessToken();
    const body = { reason: 'employee_leave', employee_id: leaveEmployeeId, previous_employee_id: leaveEditingEmployeeId, dates: leaveDates };
    const response = await fetch('/api/checklist/non-working-days', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || 'The non-working-day settings could not be saved.');
    else { setMessage(payload.deactivatedCount && payload.restoredCount ? `Saved, deactivated ${payload.deactivatedCount} and restored ${payload.restoredCount} checklist task${payload.restoredCount === 1 ? '' : 's'}.` : payload.deactivatedCount ? `Saved and deactivated ${payload.deactivatedCount} checklist task${payload.deactivatedCount === 1 ? '' : 's'}.` : payload.restoredCount ? `Saved and restored ${payload.restoredCount} checklist task${payload.restoredCount === 1 ? '' : 's'}.` : 'Non-working-day settings saved.'); await load(); }
    setLeaveSaving(false);
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

  function openEmployeeLeaveModal() {
    openEmployeeLeaveConfig();
  }

  function closeEmployeeLeaveModal() { setEmployeeLeaveModalOpen(false); setError(''); }

  function openEarlierLeave() { setEarlierLeaveSearch(''); setEarlierLeaveFromDate(''); setEarlierLeaveToDate(''); setShowAllEarlierLeave(false); setEarlierLeaveOpen(true); }
  function closeEarlierLeave() { setEarlierLeaveOpen(false); }
  function editEmployeeLeaveFromHistory({ group }) { closeEarlierLeave(); openEmployeeLeaveConfig(group); }

  if (loading) return <section className="panel checklist-loading"><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /></section>;
  if (!employee || !canDeactivateNonWorkingDayTasks(employee.role)) return <section className="panel"><EmptyState icon="calendar" title="Calendar settings unavailable" description="You do not have permission to manage workspace calendars." /></section>;
  const today = getChecklistBusinessDate(new Date(), defaultChecklistTimeZone);
  const todayLeaveEntries = sortTodayLeaveEntries(getEmployeeLeaveEntries(employeeLeave, (dateValue) => dateValue === today));
  const earlierLeaveEntries = sortEarlierLeaveEntries(getEmployeeLeaveEntries(employeeLeave, (dateValue) => dateValue < today));
  const normalizedEarlierSearch = earlierLeaveSearch.trim().toLocaleLowerCase();
  const filteredEarlierLeaveEntries = earlierLeaveEntries.filter(({ employeeName, dateValue }) => {
    const matchesSearch = !normalizedEarlierSearch || employeeName.toLocaleLowerCase().includes(normalizedEarlierSearch);
    const matchesFrom = !earlierLeaveFromDate || dateValue >= earlierLeaveFromDate;
    const matchesTo = !earlierLeaveToDate || dateValue <= earlierLeaveToDate;
    return matchesSearch && matchesFrom && matchesTo;
  });

  return <>
    {message && <div className="inline-alert success"><Icon name="checkCircle" size={16} />{message}</div>}
    {error && !employeeLeaveModalOpen && <div className="inline-alert error" role="alert"><Icon name="warning" size={16} />{error}<button className="button button-ghost button-small" type="button" onClick={load}>Try again</button></div>}
    <section className="panel checklist-panel non-working-day-settings"><SectionHeader eyebrow="Calendar" title="Non-working days" description="Sunday is automatic. Add employee leave dates here." action={<div className="non-working-day-header-actions"><button className="button button-ghost button-small" type="button" onClick={openEarlierLeave}><Icon name="clock" size={15} />Earlier leave{earlierLeaveEntries.length > 0 && <span className="button-count">{earlierLeaveEntries.length}</span>}</button><button className="button button-primary button-small" type="button" onClick={openEmployeeLeaveModal}><Icon name="plus" size={15} />Employee Leave</button></div>} /><div className="employee-leave-list-header"><div><h3>Today&apos;s leave</h3><span className="today-leave-count">{todayLeaveEntries.length} {todayLeaveEntries.length === 1 ? 'employee' : 'employees'}</span></div><span className="today-leave-date"><Icon name="calendar" size={14} />{formatTodayDate(today)}</span></div>{todayLeaveEntries.length ? <div className="employee-leave-list employee-leave-today-list">{todayLeaveEntries.map(({ group, dateValue, employeeName }) => <div className="employee-leave-row employee-leave-today-row" key={`${group.employeeId}-${dateValue}`}><div className="employee-leave-person"><span className="employee-leave-avatar" aria-hidden="true">{getEmployeeInitials(employeeName)}</span><div className="employee-leave-copy"><strong>{employeeName}</strong><span>Employee</span></div></div><span className="badge badge-blue employee-leave-type">Employee Leave</span><div className="employee-leave-actions"><button className="button button-ghost button-small" type="button" onClick={() => openEmployeeLeaveConfig(group)}>Edit</button><button className="button button-ghost button-small" type="button" onClick={() => removeConfiguredLeaveDate(group, dateValue)}>Remove</button></div></div>)}</div> : <div className="employee-leave-empty"><span className="employee-leave-empty-icon"><Icon name="calendar" size={18} /></span><div><strong>No employee leave today</strong><span>Everyone is scheduled to work today.</span></div></div>}</section>
    <section className="panel checklist-panel"><SectionHeader eyebrow="Calendar" title="National holidays" description="Manage active holiday records used by the non-working-day checklist preview." action={<button className="button button-ghost button-small" type="button" onClick={openHolidayCreate}><Icon name="plus" size={15} />Add holiday</button>} />{holidayError && <div className="inline-alert error" role="alert"><Icon name="warning" size={16} />{holidayError}</div>}{holidays.length ? <div className="holiday-list">{holidays.map((holiday) => <div className="holiday-row" key={holiday.id}><div><strong>{holiday.name}</strong><span>{formatSelectedDate(holiday.holiday_date)} · {holiday.country}</span></div><span className={`access-pill ${holiday.is_active ? 'active' : 'inactive'}`}><span />{holiday.is_active ? 'Enabled' : 'Disabled'}</span><div className="holiday-actions"><button className="button button-ghost button-small" type="button" onClick={() => openHolidayEdit(holiday)}>Edit</button>{holiday.is_active && <button className="button button-ghost button-small" type="button" onClick={() => disableHoliday(holiday)}>Disable</button>}</div></div>)}</div> : <EmptyState compact icon="calendar" title="No national holidays configured" description="Add a holiday record to make it available to non-working-day previews." action="Add holiday" onAction={openHolidayCreate} />}</section>
    <NationalHolidayModal open={holidayModalOpen} editing={holidayEditing} form={holidayForm} onChange={updateHolidayForm} onClose={closeHolidayModal} onSave={saveHoliday} saving={holidaySaving} error={holidayError} />
    <EarlierLeaveModal open={earlierLeaveOpen} entries={filteredEarlierLeaveEntries} totalCount={earlierLeaveEntries.length} search={earlierLeaveSearch} fromDate={earlierLeaveFromDate} toDate={earlierLeaveToDate} showAll={showAllEarlierLeave} onSearchChange={(value) => { setEarlierLeaveSearch(value); setShowAllEarlierLeave(false); }} onFromDateChange={(value) => { setEarlierLeaveFromDate(value); setShowAllEarlierLeave(false); }} onToDateChange={(value) => { setEarlierLeaveToDate(value); setShowAllEarlierLeave(false); }} onClearFilters={() => { setEarlierLeaveSearch(''); setEarlierLeaveFromDate(''); setEarlierLeaveToDate(''); setShowAllEarlierLeave(false); }} onViewAll={() => setShowAllEarlierLeave(true)} onEdit={editEmployeeLeaveFromHistory} onRemove={removeConfiguredLeaveDate} onClose={closeEarlierLeave} />
    <EmployeeLeaveModal open={employeeLeaveModalOpen} leaveWorkingEmployees={employees.filter((item) => item.active)} leaveEmployeeId={leaveEmployeeId} onLeaveEmployeeChange={setLeaveEmployeeId} leaveDates={leaveDates} leaveDateInput={leaveDateInput} onLeaveDateInputChange={(event) => setLeaveDateInput(event.target.value)} onAddLeaveDate={() => addDate(setLeaveDates, leaveDateInput, setLeaveDateInput)} onRemoveLeaveDate={removeLeaveDate} onSave={saveEmployeeLeave} saving={leaveSaving} error={error} onClose={closeEmployeeLeaveModal} />
  </>;
}
