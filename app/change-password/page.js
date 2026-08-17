'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../components/Icons';
import { clearAuthCache, getAccessToken, getCurrentEmployee } from '../../lib/auth';

export default function ChangePassword() {
  const router = useRouter();
  const [employee, setEmployee] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const { user, employee: profile, error: profileError } = await getCurrentEmployee();
      if (!user) {
        router.replace('/login');
        return;
      }
      if (!active) return;
      if (profileError || !profile) {
        setError('Your employee profile could not be loaded. Contact your administrator.');
        setChecking(false);
        return;
      }
      if (!profile.must_change_password) {
        router.replace('/dashboard');
        return;
      }
      setEmployee(profile);
      setChecking(false);
    })();
    return () => { active = false; };
  }, [router]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setError('Your session has expired. Please sign in again.');
      setSaving(false);
      return;
    }

    try {
      const response = await fetch('/api/account/complete-password-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || 'Your password could not be changed.');
        setSaving(false);
        return;
      }
      clearAuthCache();
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setError('The password service is unavailable. Please try again.');
      setSaving(false);
    }
  }

  if (checking) return <main className="auth-loading-shell" role="status">Preparing your account...</main>;

  return <main className="password-change-page"><section className="password-change-card"><div className="mobile-login-logo"><span className="brand-mark"><Icon name="sparkles" size={18} /></span>Delegation</div><div className="password-change-icon"><Icon name="lock" size={21} /></div><span className="eyebrow">Account setup</span><h1>Choose a new password</h1><p className="password-change-intro">Welcome{employee?.name ? `, ${employee.name}` : ''}. Your administrator gave you a temporary password. Replace it before you continue.</p><form className="auth-form" onSubmit={submit}><label htmlFor="new-password">New password</label><div className="input-with-icon"><Icon name="lock" size={17} /><input id="new-password" type="password" autoComplete="new-password" minLength="8" maxLength="128" required value={password} onChange={(event) => setPassword(event.target.value)} /></div><label htmlFor="confirm-password">Confirm new password</label><div className="input-with-icon"><Icon name="lock" size={17} /><input id="confirm-password" type="password" autoComplete="new-password" minLength="8" maxLength="128" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>{error && <div className="form-error"><Icon name="warning" size={16} />{error}</div>}<button className="button button-primary button-full" type="submit" disabled={saving}>{saving ? 'Updating password...' : 'Set new password'}{!saving && <Icon name="arrowUpRight" size={17} />}</button></form><p className="login-note"><Icon name="shield" size={14} />Your password is protected by Supabase Auth.</p></section></main>;
}
