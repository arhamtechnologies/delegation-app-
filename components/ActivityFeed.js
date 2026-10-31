'use client';

import { useState } from 'react';
import { formatDateTime } from './UI';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Spinner } from './Loader';
import { ProofThumb } from './TaskProof';

// Linear-style activity: a quiet timeline and a composer that posts with ⌘/Ctrl+Enter.
export function ActivityFeed({ createdAt, createdLabel = 'Created', updates, onPost, disabled, label = 'Update' }) {
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    setDraft('');
    const ok = await onPost(text);
    if (!ok) setDraft(text);
    setPosting(false);
  }

  return <section className="mt-8 border-t border-border pt-6" aria-label="Activity">
    <h2 className="mb-4 text-[15px] font-semibold text-foreground">Activity</h2>
    <ol className="relative grid gap-4 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-border">
      {createdAt && <li className="relative flex gap-3 text-[14px] text-muted-foreground"><span className="relative z-[1] mt-0.5 size-[15px] shrink-0 rounded-full border-2 border-background bg-muted ring-1 ring-border" />{createdLabel}<span className="ml-auto shrink-0">{formatDateTime(createdAt)}</span></li>}
      {updates.map((update) => <li key={update.id} className={cn('relative flex gap-3', update.pending && 'opacity-60')}>
        <span className="relative z-[1] mt-1 size-[15px] shrink-0 rounded-full border-2 border-background bg-brand ring-1 ring-brand/20" />
        <div className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-3 text-[13.5px] text-muted-foreground"><span className="font-medium text-foreground">{update.update_type === 'remark' ? label : update.update_type === 'proof' ? 'Proof' : 'Status change'}</span><span className="shrink-0">{update.pending ? <span className="inline-flex items-center gap-1.5"><Spinner size={12} />Posting…</span> : formatDateTime(update.created_at)}</span></div>
          <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-line text-foreground/90">{update.remark || `${update.update_type} recorded.`}</p>
          {update.update_type === 'proof' ? <ProofThumb path={update.proof_url} className="mt-2" /> : update.proof_url && <a className="mt-1.5 inline-block text-[14px] font-medium text-brand hover:underline" href={update.proof_url} target="_blank" rel="noreferrer">Open supporting file</a>}
        </div>
      </li>)}
      {!createdAt && !updates.length && <li className="text-[14px] text-muted-foreground">No updates yet.</li>}
    </ol>
    <form className="mt-4 rounded-lg border border-border bg-background focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15" onSubmit={submit}>
      <Textarea className="min-h-20 resize-none border-0 text-[15px] shadow-none focus-visible:ring-0 max-sm:text-base" aria-label="Add an update" placeholder="Leave an update — progress, a blocker, or a handoff note…" value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit(event); }} />
      <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-2"><span className="hidden text-[13px] text-muted-foreground sm:inline">⌘ Enter to post</span><Button type="submit" size="sm" className="ml-auto h-8" disabled={disabled || posting || !draft.trim()}>{posting ? <><Spinner />Posting…</> : 'Post update'}</Button></div>
    </form>
  </section>;
}

// Inserts the update straight away and reconciles with the server afterwards.
export async function postOptimisticUpdate({ text, setUpdates, insert, refresh, setError }) {
  const optimistic = { id: `pending-${Date.now()}`, update_type: 'remark', remark: text, created_at: new Date().toISOString(), pending: true };
  setUpdates((current) => [...current, optimistic]);
  const { error } = await insert(text);
  if (error) {
    setUpdates((current) => current.filter((update) => update.id !== optimistic.id));
    setError(error.message);
    return false;
  }
  // Confirmed by the server even if the follow-up refresh fails.
  setUpdates((current) => current.map((update) => (update.id === optimistic.id ? { ...update, pending: false } : update)));
  refresh();
  return true;
}
