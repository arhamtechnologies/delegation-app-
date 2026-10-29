'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { pageContainerClass } from '../../../components/AppShell';
import { Icon } from '../../../components/Icons';
import { Spinner } from '../../../components/Loader';
import { ActivityFeed, postOptimisticUpdate } from '../../../components/ActivityFeed';
import { formatDate, relativeTime } from '../../../components/UI';
import { ListEmpty, PersonChip, PriorityIcon, Property, PropertyList, StatusIcon, Surface } from '../../../components/Workflow';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { getAuthenticatedUser } from '../../../lib/auth';
import { isFreshRender, loadTaskDetail } from '../../../lib/page-data';
import { formatTaskDeadline, getTaskStatus, setTaskCompletion } from '../../../lib/task-data';
import { supabaseBrowser } from '../../../lib/supabase-browser';

const statusLabels = { pending: 'Pending', overdue: 'Overdue', completed: 'Completed' };
const priorityLabels = { normal: 'Normal', high: 'High', critical: 'Critical' };

function attachmentDetails(value, index) {
  if (typeof value === 'string') return { label: value, href: value };
  if (value && typeof value === 'object') return { label: value.name || value.label || value.url || `Attachment ${index + 1}`, href: value.url || value.href || '' };
  return { label: `Attachment ${index + 1}`, href: '' };
}

function isExternalLink(value) {
  return /^https?:\/\//i.test(value || '');
}

export default function TaskDetailView({ id, initialData }) {
  const [task, setTask] = useState(initialData?.task || null);
  const [updates, setUpdates] = useState(initialData?.updates || []);
  const [completionNotes, setCompletionNotes] = useState(initialData?.task?.completion_notes || '');
  const [completionSaved, setCompletionSaved] = useState('');
  const [loading, setLoading] = useState(!initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ background = false } = {}) => {
    if (!id) return;
    if (!background) setLoading(true);
    const user = await getAuthenticatedUser();
    if (!user) return;
    const response = await loadTaskDetail({ id });
    if (response.error) setError(response.error.message);
    else {
      setTask(response.data.task);
      setUpdates(response.data.updates);
      if (!background) setCompletionNotes(response.data.task?.completion_notes || '');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { if (!isFreshRender(initialData)) load({ background: Boolean(initialData) }); }, [initialData, load]);

  const attachments = useMemo(() => (Array.isArray(task?.attachments) ? task.attachments : []).map(attachmentDetails), [task]);

  async function toggleCompletion() {
    const previous = task;
    const completing = getTaskStatus(task) !== 'completed';
    setSaving(true);
    setError('');
    setTask((current) => ({ ...current, completed_at: completing ? new Date().toISOString() : null, status: completing ? 'closed' : 'pending' }));
    const { error: updateError } = await setTaskCompletion(id, completing);
    if (updateError) { setTask(previous); setError(updateError.message); }
    else load({ background: true });
    setSaving(false);
  }

  async function addRemark(text) {
    setError('');
    const user = await getAuthenticatedUser();
    if (!user) { setError('Your session has expired. Please sign in again.'); return false; }
    return postOptimisticUpdate({
      text,
      setUpdates,
      setError,
      insert: (remarkText) => supabaseBrowser().from('task_updates').insert({ task_id: id, author_user_id: user.id, update_type: 'remark', remark: remarkText }),
      refresh: () => load({ background: true }),
    });
  }

  async function saveCompletionNotes(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setCompletionSaved('');
    const { error: saveError } = await supabaseBrowser().from('tasks').update({ completion_notes: completionNotes.trim() || null }).eq('id', id);
    if (saveError) setError(saveError.message);
    else { setCompletionSaved('Saved'); setTask((current) => ({ ...current, completion_notes: completionNotes.trim() || null })); }
    setSaving(false);
  }

  const back = <Link href="/tasks" className="inline-flex items-center gap-1 text-[14px] font-medium text-muted-foreground hover:text-foreground"><Icon name="chevronRight" size={14} className="rotate-180" />Tasks</Link>;

  if (loading) return <div className={pageContainerClass}><div className="mb-4">{back}</div><div className="grid gap-3"><div className="h-8 w-2/3 rounded-md bg-muted" /><div className="h-4 w-1/2 rounded bg-muted" /><div className="mt-4 h-40 rounded-xl bg-muted/60" /></div></div>;
  if (!task) return <div className={pageContainerClass}><div className="mb-4">{back}</div><Surface><ListEmpty icon="clipboard" title="This task is unavailable" description={error || 'It may have been deleted or you may not have access to it.'} action={<Button asChild size="sm"><Link href="/tasks">Back to tasks</Link></Button>} /></Surface></div>;

  const taskStatus = getTaskStatus(task);
  const completed = taskStatus === 'completed';
  return <div className={pageContainerClass}>
    <div className="mb-4 flex items-center justify-between gap-3">
      {back}
      <Button size="sm" variant={completed ? 'outline' : 'default'} className="h-8 gap-1.5" onClick={toggleCompletion} disabled={saving}>{saving ? <Spinner /> : <Icon name={completed ? 'activity' : 'check'} size={15} />}{completed ? 'Reopen task' : 'Mark complete'}</Button>
    </div>
    {error && <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-[14px] text-destructive" role="alert"><Icon name="warning" size={15} />{error}</div>}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
      <article className="min-w-0">
        <h1 className="text-[22px] leading-snug font-semibold tracking-tight text-foreground sm:text-[26px]">{task.title}</h1>
        <p className="mt-3 text-[15.5px] leading-relaxed whitespace-pre-line text-foreground/80">{task.description || <span className="text-muted-foreground">No description has been added to this task.</span>}</p>
        {task.instructions && <section className="mt-6"><h2 className="mb-1.5 text-[14px] font-semibold text-muted-foreground">Instructions</h2><p className="text-[15px] leading-relaxed whitespace-pre-line text-foreground/85">{task.instructions}</p></section>}
        {attachments.length > 0 && <section className="mt-6"><h2 className="mb-2 text-[14px] font-semibold text-muted-foreground">Attachments</h2><div className="flex flex-wrap gap-2">{attachments.map((attachment, index) => <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[14px]" key={`${attachment.label}-${index}`}><Icon name="paperclip" size={14} />{isExternalLink(attachment.href) ? <a className="truncate font-medium text-brand hover:underline" href={attachment.href} target="_blank" rel="noreferrer">{attachment.label}</a> : <span className="truncate">{attachment.label}</span>}</span>)}</div></section>}

        <ActivityFeed createdAt={task.created_at} createdLabel="Task created" updates={updates} onPost={addRemark} disabled={saving} />
      </article>

      <aside className="order-first grid content-start gap-4 lg:order-none">
        <Surface className="p-2">
          <PropertyList>
            <Property label="Status"><StatusIcon status={taskStatus} size={15} />{statusLabels[taskStatus]}</Property>
            <Property label="Priority"><PriorityIcon priority={task.priority} />{priorityLabels[task.priority] || 'Normal'}</Property>
            <Property label="Assignee"><PersonChip name={task.assignee?.name || 'Unassigned'} /></Property>
            <Property label="Due"><span className={cn(taskStatus === 'overdue' && 'font-medium text-destructive')}>{formatTaskDeadline(task, { includeYear: true })}</span></Property>
            <Property label="Start">{formatDate(task.start_date)}</Property>
            <Property label="Category">{task.category || 'General'}</Property>
            <Property label="Proof">{task.proof_required ? 'Required' : 'Optional'}</Property>
            <Property label="Updated"><span suppressHydrationWarning>{relativeTime(task.updated_at || task.created_at)}</span></Property>
          </PropertyList>
        </Surface>
        <Surface>
          <form className="grid gap-2 p-3" onSubmit={saveCompletionNotes}>
            <label className="text-[14px] font-semibold text-foreground" htmlFor="completion-notes">Completion notes</label>
            <Textarea id="completion-notes" className="min-h-24 text-[14.5px] max-sm:text-base" placeholder="What was completed, delivered, or handed over?" value={completionNotes} onChange={(event) => { setCompletionNotes(event.target.value); setCompletionSaved(''); }} />
            <div className="flex items-center gap-2"><Button type="submit" variant="outline" size="sm" className="h-8" disabled={saving}>{saving && <Spinner />}Save notes</Button>{completionSaved && <span className="inline-flex items-center gap-1 text-[13.5px] text-emerald-700"><Icon name="check" size={14} />{completionSaved}</span>}</div>
          </form>
        </Surface>
      </aside>
    </div>
  </div>;
}
