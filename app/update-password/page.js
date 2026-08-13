'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../../components/Icons';
import { supabaseBrowser } from '../../lib/supabase-browser';

const INVALID_LINK_MESSAGE = 'This password reset link has expired or is invalid. Please request a new reset link.';

export default function UpdatePassword() {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = supabaseBrowser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || session?.user) {
        setReady(true);
        setChecking(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } = {} }) => {
      if (!active) return;
      setReady(Boolean(session?.user));
      setChecking(false);
      if (!session?.user) setError(INVALID_LINK_MESSAGE);
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
    setSuccess(true);
    setSaving(false);
  }

  if (checking) return <main className="auth-loading-shell" role="status">Validating your reset link...</main>;

  return <main className="password-change-page"><section className="password-change-card"><div className="mobile-login-logo"><span className="brand-mark"><Icon name="sparkles" size={18} /></span>Delegation</div><div className="password-change-icon"><Icon name="lock" size={21} /></div><span className="eyebrow">Account recovery</span><h1>{success ? 'Password updated' : 'Choose a new password'}</h1>{success ? <><p className="password-change-intro">Your password has been updated successfully. Sign in with your new password to continue.</p><Link className="button button-primary button-full" href="/login">Go to sign in<Icon name="arrowUpRight" size={17} /></Link></> : ready ? <><p className="password-change-intro">Choose a new password for your Delegation workspace account.</p><form className="auth-form" onSubmit={submit}><label htmlFor="update-password">New password</label><div className="input-with-icon"><Icon name="lock" size={17} /><input id="update-password" type="password" autoComplete="new-password" minLength="8" maxLength="128" required value={password} onChange={(event) => setPassword(event.target.value)} /></div><label htmlFor="update-password-confirmation">Confirm new password</label><div className="input-with-icon"><Icon name="lock" size={17} /><input id="update-password-confirmation" type="password" autoComplete="new-password" minLength="8" maxLength="128" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>{error && <div className="form-error" role="alert"><Icon name="warning" size={16} />{error}</div>}<button className="button button-primary button-full" type="submit" disabled={saving}>{saving ? 'Updating password...' : 'Update password'}{!saving && <Icon name="arrowUpRight" size={17} />}</button></form></> : <><p className="password-change-intro">{error || INVALID_LINK_MESSAGE}</p><Link className="button button-primary button-full" href="/forgot-password">Request a new reset link<Icon name="arrowUpRight" size={17} /></Link></>} {!success && <p className="login-note"><Link href="/login">Back to sign in</Link></p>}<p className="login-note"><Icon name="shield" size={14} />Your password is protected by Supabase Auth.</p></section></main>;
}
