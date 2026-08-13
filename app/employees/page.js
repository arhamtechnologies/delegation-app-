'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { Avatar, EmptyState, MetricCard, Modal, SectionHeader } from '../../components/UI';
import { getAuthenticatedUser } from '../../lib/auth';
import { supabaseBrowser } from '../../lib/supabase-browser';

const emptyEmployee = { name: '', email: '', mobile: '', role: 'doer', active: true, password: '' };
const roleLabels = { super_admin: 'Super admin', assigner: 'Assigner', ea: 'Executive assistant', doer: 'Doer' };

function hasLoginAccess(employee) {
  return employee?.auth_user_id !== null && employee?.auth_user_id !== undefined;
}

export default function Employees() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyEmployee);
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function load() {
    setLoading(true);
    const user = await getAuthenticatedUser();
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
    setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((employee) => {
    const query = search.trim().toLowerCase();
    return (!query || [employee.name, employee.email, employee.mobile].filter(Boolean).join(' ').toLowerCase().includes(query)) && (role === 'all' || employee.role === role);
  }), [rows, search, role]);

  function openCreate() { setEditing(null); setForm({ ...emptyEmployee }); setShowPassword(false); setError(''); setMessage(''); setModalOpen(true); }
  function openEdit(employee) { setEditing(employee); setForm({ name: employee.name || '', email: employee.email || '', mobile: employee.mobile || '', role: employee.role || 'doer', active: employee.active !== false, password: '' }); setShowPassword(false); setError(''); setMessage(''); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditing(null); setShowPassword(false); setError(''); }
  function updateField(field, value) { setForm((current) => ({ ...current, [field]: value })); }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    let saveError = null;
    if (editing) {
      const { error: updateError } = await supabaseBrowser().from('employees').update({ name: form.name, email: form.email, mobile: form.mobile, role: form.role, active: form.active }).eq('id', editing.id);
      saveError = updateError;
    } else {
      const { data: { session } = {} } = await supabaseBrowser().auth.getSession();
      if (!session?.access_token) saveError = { message: 'Your session has expired. Please sign in again.' };
      else {
        try {
          const response = await fetch('/api/admin/employees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
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
    else { setMessage(editing ? 'Employee details updated.' : 'Employee added with a login account.'); await load(); closeModal(); }
    setSaving(false);
  }

  async function toggleActive(employee) {
    if (!window.confirm(`${employee.active ? 'Deactivate' : 'Activate'} ${employee.name}?`)) return;
    const { error: updateError } = await supabaseBrowser().from('employees').update({ active: !employee.active }).eq('id', employee.id);
    if (updateError) setError(updateError.message);
    else { setMessage(`${employee.name} is now ${employee.active ? 'inactive' : 'active'}.`); load(); }
  }

  return <AppShell title="People" eyebrow="Manage / People" description="Keep your workspace roster, roles, and availability in sync." actions={<button className="button button-primary" type="button" onClick={openCreate}><Icon name="plus" size={17} />Add employee</button>}>
    <section className="metric-grid metric-grid-four"><MetricCard label="Total people" value={rows.length} change="Workspace roster" tone="blue" icon="users" /><MetricCard label="Active now" value={rows.filter((employee) => employee.active).length} change="Can receive tasks" tone="mint" icon="checkCircle" /><MetricCard label="Doers" value={rows.filter((employee) => employee.role === 'doer').length} change="Execution team" tone="purple" icon="briefcase" /><MetricCard label="Needs access" value={rows.filter((employee) => !hasLoginAccess(employee)).length} change="No login linked" tone="orange" icon="lock" /></section>
    {message && <div className="inline-alert success"><Icon name="checkCircle" size={16} />{message}</div>}
    {error && !editing && <div className="inline-alert error"><Icon name="warning" size={16} />{error}</div>}
    <section className="panel people-panel"><SectionHeader eyebrow="Directory" title="Workspace people" description="Manage who can receive, review, and complete work." /><div className="filter-bar"><label className="search-box"><Icon name="search" size={17} /><input aria-label="Search employees" placeholder="Search by name, email, or mobile" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="filter-control"><span>Role</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="all">All roles</option><option value="super_admin">Super admin</option><option value="assigner">Assigner</option><option value="ea">Executive assistant</option><option value="doer">Doer</option></select></label></div>{loading ? <div className="loading-list"><span /><span /><span /></div> : filtered.length ? <><div className="people-table-heading"><span>Person</span><span>Role</span><span>Contact</span><span>Access</span><span /></div><div className="people-list">{filtered.map((employee) => <div className="person-row" key={employee.id}><div className="person-main"><Avatar name={employee.name} /><div><strong>{employee.name}</strong><small>{employee.department_id ? 'Department member' : 'Workspace member'}</small></div></div><div><span className="role-pill">{roleLabels[employee.role] || employee.role}</span></div><div className="person-contact"><span>{employee.email || 'No email added'}</span><small>{employee.mobile || 'No mobile added'}</small></div><div><span className={`access-pill ${employee.active ? 'active' : 'inactive'}`}><span />{employee.active ? 'Active' : 'Inactive'}</span><small className="access-note">{hasLoginAccess(employee) ? 'Login ready' : 'No login linked'}</small></div><div className="person-actions"><button className="icon-button" type="button" aria-label={`Edit ${employee.name}`} onClick={() => openEdit(employee)}><Icon name="edit" size={16} /></button><button className="button button-ghost button-small" type="button" onClick={() => toggleActive(employee)}>{employee.active ? 'Deactivate' : 'Activate'}</button></div></div>)}</div></> : <EmptyState icon="users" title="No people found" description="Try a different search or add the first person to your workspace." action="Add employee" />}</section>
    <Modal open={modalOpen} title={editing ? 'Edit employee' : 'Add employee'} description={editing ? 'Keep this personâ€™s workspace details up to date.' : 'Add someone who should receive or review delegated work.'} onClose={closeModal}><form className="modal-form" onSubmit={save}><div className="form-grid form-grid-two"><div className="field field-wide"><label htmlFor="employee-name">Full name<span>*</span></label><input id="employee-name" className="input" required value={form.name} onChange={(event) => updateField('name', event.target.value)} /></div><div className="field"><label htmlFor="employee-email">Work email{!editing && <span>*</span>}</label><input id="employee-email" className="input" type="email" required={!editing} autoComplete="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} /></div><div className="field"><label htmlFor="employee-mobile">Mobile</label><input id="employee-mobile" className="input" value={form.mobile} onChange={(event) => updateField('mobile', event.target.value)} /></div>{!editing && <div className="field"><label htmlFor="employee-password">Temporary password<span>*</span></label><div className="password-input-wrap"><input id="employee-password" className="input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength="8" maxLength="128" required value={form.password} onChange={(event) => updateField('password', event.target.value)} /><button className="password-toggle" type="button" onClick={() => setShowPassword((current) => !current)}>{showPassword ? 'Hide' : 'Show'}</button></div><small className="field-help">At least 8 characters. They must replace it after signing in.</small></div>}<div className="field field-wide"><label htmlFor="employee-role">Workspace role</label><select id="employee-role" className="input" value={form.role} onChange={(event) => updateField('role', event.target.value)}><option value="assigner">Assigner</option><option value="ea">Executive assistant</option><option value="doer">Doer</option><option value="super_admin">Super admin</option></select></div><label className="checkbox-field field-wide"><input type="checkbox" checked={form.active} onChange={(event) => updateField('active', event.target.checked)} /><span><strong>Active workspace access</strong><small>Inactive people cannot be assigned new work.</small></span></label></div>{error && <div className="form-error"><Icon name="warning" size={16} />{error}</div>}<div className="modal-actions"><button className="button button-ghost" type="button" onClick={closeModal}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Add employee'}</button></div></form></Modal>
  </AppShell>;
}
