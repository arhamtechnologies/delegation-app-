'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { Avatar, Modal, RoleBadge } from '../../components/UI';
import { FilterSelect, InlineError, ListEmpty, ListSkeleton, StatStrip, Surface, Toolbar, ToolbarSearch } from '../../components/Workflow';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { getAccessToken, getCurrentEmployee, invalidateCurrentEmployee } from '../../lib/auth';
import { supabaseBrowser } from '../../lib/supabase-browser';
import { isFreshRender } from '../../lib/page-data';
import { clearTaskEmployeeCaches } from '../../lib/task-data';
import { Spinner } from '../../components/Loader';

const emptyEmployee = { name: '', email: '', mobile: '', role: 'doer', active: true };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hasLoginAccess(employee) {
  return employee?.auth_user_id !== null && employee?.auth_user_id !== undefined;
}

export default function EmployeesView({ initialData }) {
  const [rows, setRows] = useState(initialData?.rows || []);
  const [form, setForm] = useState(emptyEmployee);
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [loading, setLoading] = useState(!initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [currentRole, setCurrentRole] = useState(initialData?.currentRole || '');
  const [currentEmployeeId, setCurrentEmployeeId] = useState(initialData?.currentEmployeeId || null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState(null);
  const [resetEmployee, setResetEmployee] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState('');

  async function load() {
    setLoading(true);
    const { user, employee: currentEmployee } = await getCurrentEmployee();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data, error: employeesError } = await supabaseBrowser().from('employees').select('id,name,email,mobile,role,department_id,active,auth_user_id').order('name');
    if (employeesError) {
      setError(employeesError.message || 'Unable to load employees. Please try again.');
      setRows([]);
      setLoading(false);
      return;
    }
    setCurrentRole(currentEmployee?.role || '');
    setCurrentEmployeeId(currentEmployee?.id || null);
    setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { if (!isFreshRender(initialData)) load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => rows.filter((employee) => {
    const query = search.trim().toLowerCase();
    return (!query || [employee.name, employee.email, employee.mobile].filter(Boolean).join(' ').toLowerCase().includes(query)) && (role === 'all' || employee.role === role);
  }), [rows, search, role]);

  function openCreate() { setEditing(null); setForm({ ...emptyEmployee }); setError(''); setMessage(''); setModalOpen(true); }
  function openEdit(employee) { setEditing(employee); setForm({ name: employee.name || '', email: employee.email || '', mobile: employee.mobile || '', role: employee.role || 'doer', active: employee.active !== false }); setError(''); setMessage(''); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditing(null); setError(''); }
  function updateField(field, value) { setForm((current) => ({ ...current, [field]: value })); }
  function openReset(employee) { setResetEmployee(employee); setResetPassword(''); setResetConfirmation(''); setResetError(''); }
  function closeReset() { if (resetSaving) return; setResetEmployee(null); setResetPassword(''); setResetConfirmation(''); setResetError(''); }

  async function submitReset(event) {
    event.preventDefault();
    setResetError('');
    if (resetPassword.length < 8) {
      setResetError('Password must be at least 8 characters.');
      return;
    }
    if (resetPassword !== resetConfirmation) {
      setResetError('Passwords do not match.');
      return;
    }
    if (!resetEmployee?.auth_user_id) {
      setResetError('This employee does not have a linked login account.');
      return;
    }

    setResetSaving(true);
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setResetError('Your session has expired. Please sign in again.');
      setResetSaving(false);
      return;
    }
    try {
      const response = await fetch('/api/admin/employees/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ employee_id: resetEmployee.id, password: resetPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResetError(result.error || 'The employee password could not be reset.');
        setResetSaving(false);
        return;
      }
      setMessage('Password reset successfully.');
      closeReset();
    } catch {
      setResetError('The password service is unavailable. Please try again.');
    }
    setResetSaving(false);
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    let saveError = null;
    let emailUpdated = false;
    if (editing) {
      const normalizedEmail = form.email.trim().toLowerCase();
      const emailChanged = form.email.trim() !== (editing.email || '').trim();
      const linkedEmployee = hasLoginAccess(editing);
      if (emailChanged && !emailPattern.test(normalizedEmail)) {
        saveError = { message: 'Enter a valid email address.' };
      } else if (emailChanged && linkedEmployee && currentRole !== 'super_admin') {
        saveError = { message: 'Only Super Admins can change employee login emails.' };
      } else {
        if (emailChanged && currentRole === 'super_admin') {
          try {
            const accessToken = await getAccessToken();
            if (!accessToken) saveError = { message: 'Your session has expired. Please sign in again.' };
            else {
              const response = await fetch('/api/admin/employees/update-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ employee_id: editing.id, email: normalizedEmail }),
              });
              const result = await response.json().catch(() => ({}));
              if (!response.ok) saveError = { message: result.error || 'Unable to update the employee email. Please try again.' };
              else emailUpdated = true;
            }
          } catch {
            saveError = { message: 'The employee email service is unavailable. Please try again.' };
          }
        }
        if (!saveError) {
          const profileUpdate = { name: form.name, mobile: form.mobile, role: form.role, active: form.active };
          if (!emailChanged || currentRole !== 'super_admin') profileUpdate.email = emailChanged ? normalizedEmail : form.email;
          const { error: updateError } = await supabaseBrowser().from('employees').update(profileUpdate).eq('id', editing.id);
          saveError = updateError ? { message: 'Unable to update employee details. Please try again.' } : null;
        }
      }
    } else {
      const accessToken = await getAccessToken();
      if (!accessToken) saveError = { message: 'Your session has expired. Please sign in again.' };
      else {
        try {
          const response = await fetch('/api/admin/employees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify(form),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) saveError = { message: result.error || 'The employee could not be created.' };
        } catch {
          saveError = { message: 'The employee provisioning service is unavailable. Please try again.' };
        }
      }
    }
    if (saveError) setError(saveError.message);
    else { setMessage(emailUpdated ? 'Email updated successfully.' : editing ? 'Employee details updated.' : 'Employee added. A password setup email was sent.'); invalidateCurrentEmployee(); clearTaskEmployeeCaches(); await load(); closeModal(); }
    setSaving(false);
  }

  async function toggleActive(employee) {
    if (!window.confirm(`${employee.active ? 'Deactivate' : 'Activate'} ${employee.name}?`)) return;
    setRows((current) => current.map((row) => row.id === employee.id ? { ...row, active: !employee.active } : row));
    const { error: updateError } = await supabaseBrowser().from('employees').update({ active: !employee.active }).eq('id', employee.id);
    if (updateError) { setRows((current) => current.map((row) => row.id === employee.id ? { ...row, active: employee.active } : row)); setError(updateError.message); }
    else { setMessage(`${employee.name} is now ${employee.active ? 'inactive' : 'active'}.`); invalidateCurrentEmployee(); clearTaskEmployeeCaches(); }
  }

  async function deleteEmployee(employee) {
    if (employee.id === currentEmployeeId) {
      setError('You cannot delete your own employee account.');
      return;
    }
    if (!window.confirm(`Permanently delete ${employee.name}? Their linked login will be removed, and their assigned work, checklist records, and audit history will be transferred to your account. This cannot be undone.`)) return;

    setDeletingEmployeeId(employee.id);
    setError('');
    setMessage('');
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setError('Your session has expired. Please sign in again.');
      setDeletingEmployeeId(null);
      return;
    }
    try {
      const response = await fetch('/api/admin/employees', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ employee_id: employee.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || 'The employee could not be deleted.');
        setDeletingEmployeeId(null);
        return;
      }
      setMessage(`${employee.name} was deleted.`);
      invalidateCurrentEmployee();
      clearTaskEmployeeCaches();
      await load();
    } catch {
      setError('The employee deletion service is unavailable. Please try again.');
    }
    setDeletingEmployeeId(null);
  }

  const canDeleteEmployees = ['super_admin', 'assigner', 'ea'].includes(currentRole);

  return <AppShell title="People" description="Your workspace roster, roles, and login access." actions={<Button size="sm" className="h-8 gap-1.5" onClick={openCreate}><Icon name="plus" size={15} />Add employee</Button>}>
    <StatStrip items={[
      { label: 'People', value: rows.length, icon: 'users' },
      { label: 'Active', value: rows.filter((employee) => employee.active).length, status: 'completed', hint: 'Can receive tasks' },
      { label: 'Doers', value: rows.filter((employee) => employee.role === 'doer').length, icon: 'briefcase' },
      { label: 'No login', value: rows.filter((employee) => !hasLoginAccess(employee)).length, icon: 'lock', hint: 'Not linked to an account' },
    ]} />
    {message && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[14px] text-emerald-800" role="status"><Icon name="checkCircle" size={15} />{message}<button type="button" className="ml-auto" aria-label="Dismiss" onClick={() => setMessage('')}><Icon name="close" size={14} /></button></div>}
    <Surface>
      <Toolbar search={<ToolbarSearch value={search} onChange={setSearch} placeholder="Search by name, email, or mobile" label="Search employees" />}>
        <FilterSelect label="Role" value={role} onChange={setRole}><option value="all">Any</option><option value="super_admin">Super admin</option><option value="assigner">Assigner</option><option value="ea">Executive assistant</option><option value="doer">Doer</option></FilterSelect>
      </Toolbar>
      {!editing && <InlineError message={error} />}
      {loading ? <ListSkeleton rows={6} /> : filtered.length ? <>
        <div className="hidden h-9 grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_160px_130px_40px] items-center gap-3 border-b border-border bg-muted/50 px-4 text-[13px] font-medium text-muted-foreground md:grid"><span>Name</span><span>Contact</span><span>Role</span><span>Access</span><span /></div>
        <ul className="divide-y divide-border/70">{filtered.map((employee) => <li key={employee.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 hover:bg-muted/40 sm:px-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_160px_130px_40px]">
          <div className="flex min-w-0 items-center gap-2.5"><Avatar name={employee.name} size="sm" /><div className="min-w-0"><button type="button" className="block max-w-full truncate text-left text-[15px] font-medium text-foreground hover:text-brand" onClick={() => openEdit(employee)}>{employee.name}</button><span className="block truncate text-[13px] text-muted-foreground md:hidden">{employee.email || 'No email'}{employee.mobile ? ` · ${employee.mobile}` : ''}</span></div></div>
          <div className="hidden min-w-0 text-[14px] md:block"><span className="block truncate text-foreground/85">{employee.email || 'No email added'}</span><span className="block truncate text-[13px] text-muted-foreground">{employee.mobile || 'No mobile added'}</span></div>
          {/* Phones show role and access on one line under the name; desktop gives each its own column. */}
          <div className="col-start-1 row-start-2 ml-[42px] flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 md:contents">
          <RoleBadge role={employee.role} />
          <span className="flex items-center gap-1.5 text-[13.5px]"><span className={cn('size-1.5 rounded-full', employee.active ? 'bg-emerald-500' : 'bg-muted-foreground/50')} /><span className={employee.active ? 'text-foreground/85' : 'text-muted-foreground'}>{employee.active ? 'Active' : 'Inactive'}</span><span className="text-muted-foreground">· {hasLoginAccess(employee) ? 'Login' : 'No login'}</span></span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="size-8 justify-self-end text-muted-foreground max-md:col-start-2 max-md:row-start-1" aria-label={`Actions for ${employee.name}`}><Icon name="more" size={16} /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => openEdit(employee)}><Icon name="edit" size={15} />Edit details</DropdownMenuItem>
              {currentRole === 'super_admin' && hasLoginAccess(employee) && <DropdownMenuItem onSelect={() => openReset(employee)}><Icon name="lock" size={15} />Reset password</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => toggleActive(employee)}><Icon name={employee.active ? 'close' : 'check'} size={15} />{employee.active ? 'Deactivate' : 'Activate'}</DropdownMenuItem>
              {canDeleteEmployees && employee.id !== currentEmployeeId && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" disabled={deletingEmployeeId === employee.id} onSelect={() => deleteEmployee(employee)}><Icon name="close" size={15} />{deletingEmployeeId === employee.id ? <><Spinner />Deleting…</> : 'Delete'}</DropdownMenuItem></>}
            </DropdownMenuContent>
          </DropdownMenu>
        </li>)}</ul>
      </> : <ListEmpty icon="users" title="No people found" description="Try a different search or add the first person to the workspace." action={<Button size="sm" onClick={openCreate}><Icon name="plus" size={15} />Add employee</Button>} />}
    </Surface>
    <Modal open={modalOpen} title={editing ? 'Edit employee' : 'Add employee'} description={editing ? 'Keep this person’s workspace details up to date.' : 'Add someone who should receive or review delegated work.'} onClose={closeModal}><form className="modal-form" onSubmit={save}><div className="form-grid form-grid-two"><div className="field field-wide"><label htmlFor="employee-name">Full name<span>*</span></label><input id="employee-name" className="input" required value={form.name} onChange={(event) => updateField('name', event.target.value)} /></div><div className="field"><label htmlFor="employee-email">Work email{!editing && <span>*</span>}</label><input id="employee-email" className="input" type="email" required={!editing} autoComplete="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} /></div><div className="field"><label htmlFor="employee-mobile">Mobile</label><input id="employee-mobile" className="input" value={form.mobile} onChange={(event) => updateField('mobile', event.target.value)} /></div>{!editing && <p className="field-help field-wide">We’ll email them a secure link to set their password.</p>}<div className="field field-wide"><label htmlFor="employee-role">Workspace role</label><select id="employee-role" className="input" value={form.role} onChange={(event) => updateField('role', event.target.value)}><option value="assigner">Assigner</option><option value="ea">Executive assistant</option><option value="doer">Doer</option><option value="super_admin">Super admin</option></select></div><label className="checkbox-field field-wide"><input type="checkbox" checked={form.active} onChange={(event) => updateField('active', event.target.checked)} /><span><strong>Active workspace access</strong><small>Inactive people cannot be assigned new work.</small></span></label></div>{error && <div className="form-error"><Icon name="warning" size={16} />{error}</div>}<div className="modal-actions"><button className="button button-ghost" type="button" onClick={closeModal}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? <><Spinner />Saving...</> : editing ? 'Save changes' : 'Add employee'}</button></div></form></Modal>
    <Modal open={Boolean(resetEmployee)} title="Reset employee password" description="This changes the linked Supabase Auth password immediately." onClose={closeReset}><form className="modal-form" onSubmit={submitReset}><div className="password-reset-confirmation"><strong>Are you sure you want to reset this employee&apos;s password?</strong><span>{resetEmployee?.name} ({resetEmployee?.email || 'No email available'})</span></div><div className="form-grid"><div className="field"><label htmlFor="reset-employee-password">New password<span>*</span></label><input id="reset-employee-password" className="input" type="password" autoComplete="new-password" minLength="8" maxLength="128" required value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /></div><div className="field"><label htmlFor="reset-employee-password-confirmation">Confirm new password<span>*</span></label><input id="reset-employee-password-confirmation" className="input" type="password" autoComplete="new-password" minLength="8" maxLength="128" required value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} /></div></div>{resetError && <div className="form-error" role="alert"><Icon name="warning" size={16} />{resetError}</div>}<div className="modal-actions"><button className="button button-ghost" type="button" onClick={closeReset}>Cancel</button><button className="button button-primary" type="submit" disabled={resetSaving}>{resetSaving ? <><Spinner />Resetting password...</> : 'Reset password'}</button></div></form></Modal>
  </AppShell>;
}
