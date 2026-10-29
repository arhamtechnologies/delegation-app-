'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../components/Icons';
import { clearAuthCache, getAccessToken, getCurrentEmployee } from '../../lib/auth';
import { AuthLayout, AuthMessage, AuthNote } from '../../components/AuthLayout';
import { Loader, Spinner } from '../../components/Loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

  if (checking) return <Loader fullScreen label="Preparing your account..." />;

  return <AuthLayout eyebrow="Account setup" title="Choose a new password" description={`Welcome${employee?.name ? `, ${employee.name}` : ''}. Your administrator gave you a temporary password. Replace it before you continue.`} footer={<AuthNote />}>
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" className="h-11 text-base sm:h-10 sm:text-sm" type="password" autoComplete="new-password" minLength="8" maxLength="128" required value={password} onChange={(event) => setPassword(event.target.value)} /><p className="text-xs text-muted-foreground">At least 8 characters.</p></div>
      <div className="grid gap-2"><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" className="h-11 text-base sm:h-10 sm:text-sm" type="password" autoComplete="new-password" minLength="8" maxLength="128" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
      {error && <AuthMessage>{error}</AuthMessage>}
      <Button className="mt-2 h-11 w-full text-[16px] sm:h-10 sm:text-sm" type="submit" disabled={saving}>{saving ? <><Spinner />Updating password...</> : 'Set new password'}{!saving && <Icon name="arrowUpRight" size={17} />}</Button>
    </form>
  </AuthLayout>;
}
