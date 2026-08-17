'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../../components/AppShell';
import { Icon } from '../../../components/Icons';
import { EmptyState, PriorityBadge, SectionHeader, StatusBadge, formatDate, formatDateTime, relativeTime } from '../../../components/UI';
import { getAuthenticatedUser } from '../../../lib/auth';
import { formatTaskDeadline, getTask, getTaskStatus, setTaskCompletion } from '../../../lib/task-data';
import { supabaseBrowser } from '../../../lib/supabase-browser';

function attachmentDetails(value, index) {
  if (typeof value === 'string') return { label: value, href: value };
  if (value && typeof value === 'object') return { label: value.name || value.label || value.url || `Attachment ${index + 1}`, href: value.url || value.href || '' };
  return { label: `Attachment ${index + 1}`, href: '' };
}

function isExternalLink(value) {
  return /^https?:\/\//i.test(value || '');
}

export default function TaskDetail() {
  const { id } = useParams();
  const [task, setTask] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [remark, setRemark] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionSaved, setCompletionSaved] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const user = await getAuthenticatedUser();
    if (!user) return;
    const [{ data: taskData, error: taskError }, { data: updateRows = [] } = {}] = await Promise.all([
      getTask(id),
      supabaseBrowser().from('task_updates').select('id,update_type,remark,proof_url,created_at').eq('task_id', id).order('created_at', { ascending: true }),
    ]);
    setTask(taskData || null);
    setCompletionNotes(taskData?.completion_notes || '');
    setUpdates(updateRows || []);
    if (taskError && taskError.code !== 'PGRST116') setError(taskError.message);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const attachments = useMemo(() => (Array.isArray(task?.attachments) ? task.attachments : []).map(attachmentDetails), [task]);

  async function toggleCompletion() {
    setSaving(true);
    setError('');
    const { error: updateError } = await setTaskCompletion(id, getTaskStatus(task) !== 'completed');
    if (updateError) setError(updateError.message);
    else await load();
    setSaving(false);
  }

  async function addRemark(event) {
    event.preventDefault();
    if (!remark.trim()) return;
    setSaving(true);
    setError('');
    const user = await getAuthenticatedUser();
    if (!user) {
      setError('Your session has expired. Please sign in again.');
      setSaving(false);
      return;
    }
    const { error: updateError } = await supabaseBrowser().from('task_updates').insert({ task_id: id, author_user_id: user.id, update_type: 'remark', remark: remark.trim() });
    if (updateError) setError(updateError.message);
    else { setRemark(''); await load(); }
    setSaving(false);
  }

  async function saveCompletionNotes(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setCompletionSaved('');
    const { error: saveError } = await supabaseBrowser().from('tasks').update({ completion_notes: completionNotes.trim() || null }).eq('id', id);
    if (saveError) setError(saveError.message);
    else { setCompletionSaved('Completion notes saved.'); await load(); }
    setSaving(false);
  }

  if (loading) return <AppShell title="Task details" eyebrow="Workspace / Tasks"><div className="panel detail-loading"><div className="loading-list"><span /><span /><span /></div></div></AppShell>;
  if (!task) return <AppShell title="Task not found" eyebrow="Workspace / Tasks"><EmptyState icon="clipboard" title="This task is unavailable" description={error || 'It may have been deleted or you may not have access to it.'} action="Back to tasks" href="/tasks" /></AppShell>;

  const taskStatus = getTaskStatus(task);
  return <AppShell title="Task details" eyebrow="Workspace / Tasks" actions={<><Link className="button button-ghost button-small" href="/tasks"><Icon name="chevronRight" size={15} className="flip-icon" />Back to tasks</Link><button className="button button-primary button-small" type="button" onClick={toggleCompletion} disabled={saving}><Icon name={taskStatus === 'completed' ? 'activity' : 'check'} size={16} />{taskStatus === 'completed' ? 'Reopen task' : 'Mark complete'}</button></>}>
    {error && <div className="inline-alert error"><Icon name="warning" size={16} />{error}</div>}
    <div className="detail-layout">
      <section className="panel task-detail-main">
        <div className="detail-topline"><div className="detail-tags"><PriorityBadge priority={task.priority} /></div><span className="detail-updated">Updated {relativeTime(task.updated_at || task.created_at)}</span></div>
        <h2 className="detail-title">{task.title}</h2>
        <p className="detail-description">{task.description || 'No description has been added to this task.'}</p>
        <div className="automatic-status-panel"><span className="automatic-status-label">Automatic status</span><StatusBadge status={taskStatus} /><p>{taskStatus === 'completed' ? 'This task has been marked complete.' : taskStatus === 'overdue' ? 'The due date has passed and the task is not complete.' : 'The task is due today or in the future.'}</p></div>
        <div className="detail-metadata">
          <div><span className="metadata-icon"><Icon name="user" size={16} /></span><span><small>Assigned to</small><strong>{task.assignee?.name || 'Unassigned'}</strong></span></div>
          <div><span className="metadata-icon"><Icon name="calendar" size={16} /></span><span><small>Start date</small><strong>{formatDate(task.start_date, { month: 'short', day: 'numeric', year: 'numeric' })}</strong></span></div>
          <div><span className="metadata-icon"><Icon name="calendar" size={16} /></span><span><small>Due date</small><strong>{formatTaskDeadline(task, { includeYear: true })}</strong></span></div>
          <div><span className="metadata-icon"><Icon name="paperclip" size={16} /></span><span><small>Proof</small><strong>{task.proof_required ? 'Required' : 'Optional'}</strong></span></div>
        </div>
        <div className="detail-notes"><SectionHeader eyebrow="Handoff notes" title="Instructions" />{task.instructions ? <p>{task.instructions}</p> : <p className="muted-copy">No special instructions were added. Use the updates panel to add context as the work progresses.</p>}</div>
        {task.completion_notes && <div className="detail-notes"><SectionHeader eyebrow="Close-out" title="Completion notes" /><p>{task.completion_notes}</p></div>}
        {attachments.length > 0 && <div className="detail-notes"><SectionHeader eyebrow="Supporting material" title="Attachments" /><div className="attachment-list">{attachments.map((attachment, index) => <div className="attachment-item" key={`${attachment.label}-${index}`}><Icon name="paperclip" size={15} />{isExternalLink(attachment.href) ? <a href={attachment.href} target="_blank" rel="noreferrer">{attachment.label}</a> : <span>{attachment.label}</span>}</div>)}</div></div>}
      </section>
      <aside className="detail-sidebar">
        <section className="panel update-panel"><SectionHeader eyebrow="Keep the loop closed" title="Add an update" description="Share progress, a blocker, or a completion note." /><form onSubmit={addRemark}><textarea className="input" rows="5" aria-label="Task update" placeholder="Write an update for the people following this task..." value={remark} onChange={(event) => setRemark(event.target.value)} /><button className="button button-primary button-full" type="submit" disabled={saving || !remark.trim()}>{saving ? 'Saving...' : 'Post update'}<Icon name="arrowUpRight" size={16} /></button></form></section>
        <section className="panel completion-panel"><SectionHeader eyebrow="Close the loop" title="Completion notes" description="Capture the final handoff details without changing other task fields." /><form onSubmit={saveCompletionNotes}><textarea className="input" rows="4" aria-label="Completion notes" placeholder="What was completed, delivered, or handed over?" value={completionNotes} onChange={(event) => setCompletionNotes(event.target.value)} /><button className="button button-ghost button-full" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save completion notes'}</button>{completionSaved && <div className="inline-alert success"><Icon name="checkCircle" size={15} />{completionSaved}</div>}</form></section>
        <section className="panel activity-detail-panel"><SectionHeader eyebrow="Audit trail" title="Activity" />{updates.length ? <div className="timeline">{updates.map((update) => <div className="timeline-item" key={update.id}><span className="timeline-dot" /><div><div className="timeline-meta"><strong>{update.update_type === 'remark' ? 'Workspace update' : 'Status update'}</strong><small>{formatDateTime(update.created_at)}</small></div><p>{update.remark || `${update.update_type} recorded.`}</p>{update.proof_url && <a href={update.proof_url} target="_blank" rel="noreferrer">Open supporting file</a>}</div></div>)}</div> : <EmptyState compact icon="activity" title="No updates yet" description="The first remark or status change will appear here." />}</section>
      </aside>
    </div>
  </AppShell>;
}
