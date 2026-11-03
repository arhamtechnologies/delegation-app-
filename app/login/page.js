'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearAuthCache, getCurrentEmployee, syncAuthSession } from '../../lib/auth';
import { supabaseBrowser } from '../../lib/supabase-browser';
import { AuthLayout, AuthMessage } from '../../components/AuthLayout';
import { Loader, Spinner } from '../../components/Loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [resetMessage, setResetMessage] = useState('');
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function redirectIfAuthenticated() {
      const { user, employee } = await getCurrentEmployee();
      if (!active) return;
      if (user && employee) {
        router.replace(employee.must_change_password ? '/change-password' : '/dashboard');
        router.refresh();
        return;
      }
      setCheckingSession(false);
    }

    redirectIfAuthenticated();
    const { data: { subscription } } = supabaseBrowser().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') clearAuthCache();
      else if (session) syncAuthSession(session);
      if (event === 'SIGNED_IN') redirectIfAuthenticated();
      if (event === 'SIGNED_OUT' && active) setCheckingSession(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (window.location.search.includes('reset=success')) setResetMessage('Your password has been updated. Sign in with your new password.');
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const supabase = supabaseBrowser();
    const identifier = username.trim().toLowerCase();
    const isEmail = identifier.includes('@');
    const isUsername = /^[a-z]{2}-\d{3}$/.test(identifier);
    let email = identifier;
    if (!isEmail && !isUsername) {
      setError('Enter a valid username such as ea-001 or a work email address.');
      setLoading(false);
      return;
    }
    if (isUsername) {
      try {
        const response = await fetch('/api/auth/resolve-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: identifier }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.email) {
          setError(result.error || 'Invalid username/email or password.');
          setLoading(false);
          return;
        }
        email = result.email;
      } catch {
        setError('The login service is unavailable. Please try again.');
        setLoading(false);
        return;
      }
    }
    const { data: { session } = {}, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    syncAuthSession(session);
    const { employee, error: employeeError } = await getCurrentEmployee();
    if (employeeError || !employee) {
      await supabase.auth.signOut();
      setError('This account is not linked to a workspace employee profile. Contact your administrator.');
      setLoading(false);
      return;
    }
    router.replace(employee.must_change_password ? '/change-password' : '/dashboard');
    router.refresh();
  }

  if (checkingSession) return <Loader fullScreen label="Checking your session..." />;

  return <AuthLayout title="Sign in to your workspace" description="Use your company account to continue.">
    {resetMessage && <AuthMessage tone="success" className="mb-4">{resetMessage}</AuthMessage>}
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2"><Label htmlFor="username">Username or email</Label><Input id="username" className="h-11 text-base sm:h-10 sm:text-sm" type="text" autoComplete="username" placeholder="e.g. ea-001 or you@company.com" required value={username} onChange={(event) => setUsername(event.target.value)} /></div>
      <div className="grid gap-2"><div className="flex items-center justify-between"><Label htmlFor="password">Password</Label><Link className="text-sm font-medium text-brand hover:underline" href="/forgot-password">Forgot password?</Link></div><Input id="password" className="h-11 text-base sm:h-10 sm:text-sm" type="password" autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
      {error && <AuthMessage>{error}</AuthMessage>}
      <Button className="mt-2 h-11 w-full text-[16px] sm:h-10 sm:text-sm" type="submit" disabled={loading}>{loading ? <><Spinner />Signing in...</> : 'Sign in'}</Button>
    </form>
  </AuthLayout>;
}
