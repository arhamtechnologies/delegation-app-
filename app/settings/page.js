'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { Avatar, SectionHeader } from '../../components/UI';
import { supabaseBrowser } from '../../lib/supabase-browser';

export default function Settings() {
  const [profile, setProfile] = useState({ name: '', email: '', mobile: '', company_mobile: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } = {} } = await supabaseBrowser().auth.getUser();
      if (!user) return;
      const { data } = await supabaseBrowser().from('employees').select('id,name,email,mobile,company_mobile,role').eq('auth_user_id', user.id).maybeSingle();
      setProfile(data || { email: user.email || '' });
    })();
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaving(true); setError(''); setMessage('');
    const { data: { user } = {} } = await supabaseBrowser().auth.getUser();
    const { error: saveError } = await supabaseBrowser().from('employees').update({ name: profile.name, email: profile.email, mobile: profile.mobile, company_mobile: profile.company_mobile }).eq('auth_user_id', user?.id);
    if (saveError) setError(saveError.message); else setMessage('Profile saved successfully.');
    setSaving(false);
  }

  return <AppShell title="Settings" eyebrow="Manage / Settings" description="Your profile, workspace preferences, and access details.">
    <div className="settings-layout"><section className="panel settings-profile"><SectionHeader eyebrow="Profile" title="Personal details" description="This is how your name appears across task updates and reports." /><div className="profile-preview"><Avatar name={profile.name || 'Workspace user'} size="lg" /><div><strong>{profile.name || 'Workspace user'}</strong><span>{profile.role ? profile.role.replace('_', ' ') : 'Workspace member'}</span></div><button className="button button-ghost button-small" type="button"><Icon name="edit" size={14} />Change photo</button></div><form className="settings-form" onSubmit={save}><div className="form-grid form-grid-two"><div className="field"><label htmlFor="settings-name">Full name</label><input id="settings-name" className="input" value={profile.name || ''} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} /></div><div className="field"><label htmlFor="settings-email">Work email</label><input id="settings-email" className="input" type="email" value={profile.email || ''} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} /></div><div className="field"><label htmlFor="settings-mobile">Mobile number</label><input id="settings-mobile" className="input" value={profile.mobile || ''} onChange={(event) => setProfile((current) => ({ ...current, mobile: event.target.value }))} /></div><div className="field"><label htmlFor="settings-company-mobile">Company mobile</label><input id="settings-company-mobile" className="input" value={profile.company_mobile || ''} onChange={(event) => setProfile((current) => ({ ...current, company_mobile: event.target.value }))} /></div></div>{error && <div className="form-error"><Icon name="warning" size={16} />{error}</div>}{message && <div className="inline-alert success"><Icon name="checkCircle" size={16} />{message}</div>}<button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save profile'}</button></form></section><aside className="settings-side"><section className="panel setting-card"><span className="setting-card-icon purple"><Icon name="shield" size={18} /></span><h3>Role-based access</h3><p>Permissions are controlled by your employee role and Supabase security policies.</p><span className="setting-status"><Icon name="checkCircle" size={14} />Protected</span></section><section className="panel setting-card"><span className="setting-card-icon blue"><Icon name="bell" size={18} /></span><h3>Notifications</h3><p>Task updates and deadline alerts are available from the notification center.</p><Link href="/notifications" className="text-link">Open notification center <Icon name="arrowUpRight" size={14} /></Link></section><section className="panel setting-card"><span className="setting-card-icon mint"><Icon name="lock" size={18} /></span><h3>Account security</h3><p>Manage your password and authentication settings from Supabase Auth.</p><span className="muted-copy">Contact an administrator if access needs to change.</span></section></aside></div>
  </AppShell>;
}
