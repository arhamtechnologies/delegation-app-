'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '../../components/Icons';
import { clearAuthCache, syncAuthSession } from '../../lib/auth';
import { supabaseBrowser } from '../../lib/supabase-browser';

const INVALID_LINK_MESSAGE = 'This password reset link is invalid or has expired. Please request a new password reset link.';

export default function UpdatePassword() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const supabase = supabaseBrowser();
    let recoveryDetected = false;
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
    const queryParams = new URLSearchParams(window.location.search);
    const hasRecoveryError = hashParams.get('error') || hashParams.get('error_code') || hashParams.get('error_description') || queryParams.get('error') || queryParams.get('error_code') || queryParams.get('error_description');
    const hasRecoveryToken = hashParams.has('access_token') || queryParams.has('code');
    if (hasRecoveryError) {
      setError(INVALID_LINK_MESSAGE);
      setChecking(false);
      return () => { active = false; };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (session) syncAuthSession(session);
      if (event === 'PASSWORD_RECOVERY') {
        recoveryDetected = true;
        setReady(true);
        setChecking(false);
        setError('');
      }
    });

    supabase.auth.getSession().then(({ data: { session } = {} }) => {
      if (!active) return;
      if (recoveryDetected || (session?.user && hasRecoveryToken)) setReady(true);
      setChecking(false);
      if (!recoveryDetected && !(session?.user && hasRecoveryToken)) setError(INVALID_LINK_MESSAGE);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

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
    const { error: updateError } = await supabaseBrowser().auth.updateUser({ password });
    if (updateError) {
      setError(INVALID_LINK_MESSAGE);
      setSaving(false);
      return;
    }
    await supabaseBrowser().auth.signOut();
    clearAuthCache();
    router.replace('/login?reset=success');
    router.refresh();
  }

  if (checking) return <main className="auth-loading-shell" role="status">Validating your reset link...</main>;

  return <main className="password-change-page"><section className="password-change-card"><div className="mobile-login-logo"><span className="brand-mark"><Icon name="sparkles" size={18} /></span>Delegation</div><div className="password-change-icon"><Icon name="lock" size={21} /></div><span className="eyebrow">Account recovery</span><h1>{ready ? 'Set a new password' : 'Reset link expired'}</h1>{ready ? <><p className="password-change-intro">Enter a new password for your account.</p><form className="auth-form" onSubmit={submit}><label htmlFor="update-password">New password</label><div className="input-with-icon"><Icon name="lock" size={17} /><input id="update-password" type="password" autoComplete="new-password" minLength="8" maxLength="128" required value={password} onChange={(event) => setPassword(event.target.value)} /></div><label htmlFor="update-password-confirmation">Confirm new password</label><div className="input-with-icon"><Icon name="lock" size={17} /><input id="update-password-confirmation" type="password" autoComplete="new-password" minLength="8" maxLength="128" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>{error && <div className="form-error" role="alert"><Icon name="warning" size={16} />{error}</div>}<button className="button button-primary button-full" type="submit" disabled={saving}>{saving ? 'Updating password...' : 'Update password'}{!saving && <Icon name="arrowUpRight" size={17} />}</button></form></> : <><p className="password-change-intro">{INVALID_LINK_MESSAGE}</p><Link className="button button-primary button-full" href="/forgot-password">Request a new reset link<Icon name="arrowUpRight" size={17} /></Link></>} {!ready && <p className="login-note"><Link href="/login">Back to sign in</Link></p>}<p className="login-note"><Icon name="shield" size={14} />Your password is protected by Supabase Auth.</p></section></main>;
}
