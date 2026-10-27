'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '../../components/Icons';
import { supabaseBrowser } from '../../lib/supabase-browser';
import { AuthLayout, AuthMessage } from '../../components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
      await supabaseBrowser().auth.resetPasswordForEmail(normalizedEmail, { redirectTo: `${window.location.origin}/update-password` });
      setMessage(GENERIC_MESSAGE);
    } catch {
      setMessage(GENERIC_MESSAGE);
    } finally {
      setSending(false);
    }
  }

  return <AuthLayout eyebrow="Account recovery" title="Reset your password" description="Enter your workspace email and we&apos;ll send you a secure link to choose a new password." footer={<Link className="font-medium text-brand hover:underline" href="/login">Back to sign in</Link>}>
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-2"><Label htmlFor="reset-email">Email address</Label><Input id="reset-email" className="h-11 text-base sm:h-10 sm:text-sm" type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
      {error && <AuthMessage>{error}</AuthMessage>}
      {message && <AuthMessage tone="success">{message}</AuthMessage>}
      <Button className="mt-2 h-11 w-full text-[15px] sm:h-10 sm:text-sm" type="submit" disabled={sending}>{sending ? 'Sending link...' : 'Send reset link'}{!sending && <Icon name="arrowUpRight" size={17} />}</Button>
    </form>
  </AuthLayout>;
}
