'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '../../components/Icons';
import { supabaseBrowser } from '../../lib/supabase-browser';

const RESET_REDIRECT_URL = 'https://delegation.arham.app/update-password';
const GENERIC_MESSAGE = 'If an account exists for this email address, a password reset link has been sent.';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError('Enter your email address to continue.');
      return;
    }

    setSending(true);
    try {
      await supabaseBrowser().auth.resetPasswordForEmail(normalizedEmail, { redirectTo: RESET_REDIRECT_URL });
      setMessage(GENERIC_MESSAGE);
    } catch {
      setMessage(GENERIC_MESSAGE);
    } finally {
      setSending(false);
    }
  }

  return <main className="password-change-page"><section className="password-change-card"><div className="mobile-login-logo"><span className="brand-mark"><Icon name="sparkles" size={18} /></span>Delegation</div><div className="password-change-icon"><Icon name="lock" size={21} /></div><span className="eyebrow">Account recovery</span><h1>Reset your password</h1><p className="password-change-intro">Enter your workspace email and we&apos;ll send you a secure link to choose a new password.</p><form className="auth-form" onSubmit={submit}><label htmlFor="reset-email">Email address</label><input id="reset-email" className="input" type="email" autoComplete="email" placeholder="you@company.com" required value={email} onChange={(event) => setEmail(event.target.value)} />{error && <div className="form-error" role="alert"><Icon name="warning" size={16} />{error}</div>}{message && <div className="inline-alert success" role="status"><Icon name="checkCircle" size={16} />{message}</div>}<button className="button button-primary button-full" type="submit" disabled={sending}>{sending ? 'Sending link...' : 'Send reset link'}{!sending && <Icon name="arrowUpRight" size={17} />}</button></form><p className="login-note"><Link href="/login">Back to sign in</Link></p></section></main>;
}
