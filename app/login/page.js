'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../components/Icons';
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
    const { error: signInError } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return <main className="login-page"><section className="login-brand-panel"><div className="login-brand"><span className="brand-mark brand-mark-large"><Icon name="sparkles" size={22} /></span><span>Delegation</span></div><div className="login-pitch"><span className="hero-kicker"><Icon name="sparkles" size={14} />The calm way to get work done</span><h1>Make every handoff feel effortless.</h1><p>One focused workspace for assigning work, keeping people aligned, and closing the loop.</p><div className="login-feature-list"><div><span><Icon name="check" size={16} /></span><p><strong>Clear accountability</strong><small>Everyone knows what is next.</small></p></div><div><span><Icon name="activity" size={16} /></span><p><strong>Live progress</strong><small>Updates arrive before surprises.</small></p></div><div><span><Icon name="shield" size={16} /></span><p><strong>Built for trust</strong><small>Private, role-aware workspaces.</small></p></div></div></div><div className="login-panel-footer"><span>Delegation workspace</span><span>v1.0</span></div></section><section className="login-form-panel"><div className="login-form-wrap"><div className="mobile-login-logo"><span className="brand-mark"><Icon name="sparkles" size={18} /></span>Delegation</div><div className="login-heading"><span className="eyebrow">Welcome back</span><h2>Sign in to your workspace</h2><p>Use your company account to continue.</p></div><form onSubmit={submit} className="auth-form"><label htmlFor="email">Work email</label><div className="input-with-icon"><Icon name="user" size={17} /><input id="email" type="email" autoComplete="email" placeholder="you@company.com" required value={email} onChange={(event) => setEmail(event.target.value)} /></div><label htmlFor="password">Password</label><div className="input-with-icon"><Icon name="lock" size={17} /><input id="password" type="password" autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>{error && <div className="form-error"><Icon name="warning" size={16} />{error}</div>}<button className="button button-primary button-full" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Continue'}{!loading && <Icon name="arrowUpRight" size={17} />}</button></form><p className="login-note"><Icon name="shield" size={14} />Your access is protected by your workspace permissions.</p></div><div className="login-mobile-footer">Need help? Contact your workspace administrator.</div></section></main>;
}
