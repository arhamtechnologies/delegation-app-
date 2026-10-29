'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '../../components/Icons';
import { clearAuthCache, getAccessToken, syncAuthSession } from '../../lib/auth';
import { supabaseBrowser, supabaseRecoveryBrowser } from '../../lib/supabase-browser';
import { AuthLayout, AuthMessage, AuthNote } from '../../components/AuthLayout';
import { Loader, Spinner } from '../../components/Loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    const hashAccessToken = hashParams.get('access_token');
    const recoveryCode = queryParams.get('code');
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

    async function validateRecoverySession() {
      let initializationError = null;
      try {
        // Wait for Supabase to process an implicit recovery hash before reading
        // the stored session. This also gives PASSWORD_RECOVERY a chance to fire.
        const { error } = await supabase.auth.initialize();
        initializationError = error;
      } catch (error) {
        initializationError = error;
      }

      if (!active) return;

      let { data: { session } = {} } = await supabase.auth.getSession();
      let exchangedSession = null;

      // PKCE links arrive with ?code=... and must be exchanged before
      // updateUser can use the recovery session.
      if (recoveryCode) {
        const flowId = queryParams.get('sb_flow_id');
        const { data, error: exchangeError } = await supabaseRecoveryBrowser().auth.exchangeCodeForSession(
          recoveryCode,
          flowId ? { flowId } : undefined,
        );
        if (exchangeError) {
          if (active) {
            setError(INVALID_LINK_MESSAGE);
            setChecking(false);
          }
          return;
        }
        exchangedSession = data?.session || null;
        session = exchangedSession;
        if (session) syncAuthSession(session);
      }

      if (!active) return;

      // A pre-existing session must not make an invalid recovery URL valid.
      // For hash recovery, the session access token must match the token from
      // the URL; for PKCE, only the exchanged session is accepted.
      const validHashSession = Boolean(hashAccessToken && session?.access_token === hashAccessToken);
      const validRecoverySession = recoveryDetected || validHashSession || Boolean(exchangedSession);
      if (validRecoverySession && (!initializationError || recoveryDetected || exchangedSession)) {
        setReady(true);
        setError('');
      } else {
        setError(INVALID_LINK_MESSAGE);
      }
      setChecking(false);
    }

    validateRecoverySession();

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
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setError('Your password changed, but account setup could not be completed. Please sign in and contact your administrator.');
      setSaving(false);
      return;
    }
    try {
      const response = await fetch('/api/account/complete-password-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ complete_setup: true }),
      });
      if (!response.ok) {
        setError('Your password changed, but account setup could not be completed. Please try again or contact your administrator.');
        setSaving(false);
        return;
      }
    } catch {
      setError('Your password changed, but account setup could not be completed. Please try again.');
      setSaving(false);
      return;
    }
    await supabaseBrowser().auth.signOut({ scope: 'local' });
    clearAuthCache();
    router.replace('/login?reset=success');
    router.refresh();
  }

  if (checking) return <Loader fullScreen label="Validating your reset link..." />;

  return <AuthLayout eyebrow="Account recovery" title={ready ? 'Set a new password' : 'Reset link expired'} description={ready ? 'Enter a new password for your account.' : INVALID_LINK_MESSAGE} footer={<>{!ready && <Link className="font-medium text-brand hover:underline" href="/login">Back to sign in</Link>}<AuthNote /></>}>
    {ready ? <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-2"><Label htmlFor="update-password">New password</Label><Input id="update-password" className="h-11 text-base sm:h-10 sm:text-sm" type="password" autoComplete="new-password" minLength="8" maxLength="128" required value={password} onChange={(event) => setPassword(event.target.value)} /><p className="text-xs text-muted-foreground">At least 8 characters.</p></div>
      <div className="grid gap-2"><Label htmlFor="update-password-confirmation">Confirm new password</Label><Input id="update-password-confirmation" className="h-11 text-base sm:h-10 sm:text-sm" type="password" autoComplete="new-password" minLength="8" maxLength="128" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
      {error && <AuthMessage>{error}</AuthMessage>}
      <Button className="mt-2 h-11 w-full text-[16px] sm:h-10 sm:text-sm" type="submit" disabled={saving}>{saving ? <><Spinner />Updating password...</> : 'Update password'}{!saving && <Icon name="arrowUpRight" size={17} />}</Button>
    </form> : <Button asChild className="mt-2 h-11 w-full text-[16px] sm:h-10 sm:text-sm"><Link href="/forgot-password">Request a new reset link<Icon name="arrowUpRight" size={17} /></Link></Button>}
  </AuthLayout>;
}
