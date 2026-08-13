'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '../../lib/supabase-browser';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const supabase = supabaseBrowser();
    const { data: { user } = {}, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    const { data: employee, error: employeeError } = await supabase.from('employees').select('must_change_password').eq('auth_user_id', user?.id).maybeSingle();
    if (employeeError || !employee) {
      await supabase.auth.signOut();
      setError('This account is not linked to a workspace employee profile. Contact your administrator.');
      setLoading(false);
      return;
    }
    router.replace(employee.must_change_password ? '/change-password' : '/dashboard');
    router.refresh();
  }

  return <main className="login-page login-simple"><section className="login-form-panel"><div className="login-form-wrap"><div className="login-brand"><span className="brand-mark">D</span><span>Delegation</span></div><div className="login-heading"><h1>Sign in to your workspace</h1><p>Use your company account to continue.</p></div><form onSubmit={submit} className="auth-form"><label htmlFor="email">Email</label><input id="email" className="input" type="email" autoComplete="email" placeholder="you@company.com" required value={email} onChange={(event) => setEmail(event.target.value)} /><label htmlFor="password">Password</label><input id="password" className="input" type="password" autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={(event) => setPassword(event.target.value)} /><div className="login-form-link"><Link href="/forgot-password">Forgot password?</Link></div>{error && <div className="form-error" role="alert">{error}</div>}<button className="button button-primary button-full" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button></form></div></section></main>;
}
