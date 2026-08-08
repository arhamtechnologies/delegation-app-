'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../../components/AppShell';
import { Icon } from '../../../components/Icons';
import { EmptyState, PriorityBadge, SectionHeader, StatusBadge, formatDate, formatDateTime, relativeTime, statusMeta } from '../../../components/UI';
import { getTask, updateTaskStatus } from '../../../lib/task-data';
import { supabaseBrowser } from '../../../lib/supabase-browser';

const workflow = ['pending', 'followup', 'delayed', 'submitted', 'closed'];

export default function TaskDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [task, setTask] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: taskData, error: taskError }, { data: updateRows = [] } = {}] = await Promise.all([
      getTask(id),
      supabaseBrowser().from('task_updates').select('*').eq('task_id', id).order('created_at', { ascending: true }),
    ]);
    setTask(taskData || null);
    setUpdates(updateRows || []);
    if (taskError && taskError.code !== 'PGRST116') setError(taskError.message);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const currentIndex = useMemo(() => Math.max(0, workflow.indexOf(task?.status || 'pending')), [task]);

  async function changeStatus(status) {
    setSaving(true);
    const { error: updateError } = await updateTaskStatus(id, status);
    if (updateError) setError(updateError.message);
    else await load();
    setSaving(false);
  }

  async function addRemark(event) {
    event.preventDefault();
    if (!remark.trim()) return;
    setSaving(true);
    setError('');
    const { data: { user } = {} } = await supabaseBrowser().auth.getUser();
    const { error: updateError } = await supabaseBrowser().from('task_updates').insert({ task_id: id, author_user_id: user?.id, update_type: 'remark', remark: remark.trim() });
    if (updateError) setError(updateError.message);
    else { setRemark(''); await load(); }
    setSaving(false);
  }

  if (loading) return <AppShell title="Task details" eyebrow="Workspace / Tasks"><div className="panel detail-loading"><div className="loading-list"><span /><span /><span /></div></div></AppShell>;
  if (!task) return <AppShell title="Task not found" eyebrow="Workspace / Tasks"><EmptyState icon="clipboard" title="This task is unavailable" description={error || 'It may have been deleted or you may not have access to it.'} action="Back to tasks" href="/tasks" /></AppShell>;

  return <AppShell title="Task details" eyebrow="Workspace / Tasks" actions={<><Link className="button button-ghost button-small" href="/tasks"><Icon name="chevronRight" size={15} className="flip-icon" />Back to tasks</Link><button className="button button-primary button-small" type="button" onClick={() => changeStatus(task.status === 'closed' ? 'pending' : 'closed')} disabled={saving}><Icon name={task.status === 'closed' ? 'activity' : 'check'} size={16} />{task.status === 'closed' ? 'Reopen task' : 'Mark complete'}</button></>}>
    {error && <div className="inline-alert error"><Icon name="warning" size={16} />{error}</div>}
    <div className="detail-layout"><section className="panel task-detail-main"><div className="detail-topline"><div className="detail-tags"><PriorityBadge priority={task.priority} /><StatusBadge status={task.status} /></div><span className="detail-updated">Updated {relativeTime(task.updated_at || task.created_at)}</span></div><h2 className="detail-title">{task.title}</h2><p className="detail-description">{task.description || 'No description has been added to this task.'}</p><div className="workflow"><div className="workflow-line" /><div className="workflow-steps">{workflow.map((step, index) => <button className={`workflow-step${index <= currentIndex ? ' complete' : ''}${step === task.status ? ' current' : ''}`} key={step} type="button" onClick={() => changeStatus(step)} disabled={saving}><span><Icon name={index < currentIndex ? 'check' : statusMeta[step].icon} size={15} /></span><small>{statusMeta[step].label}</small></button>)}</div></div><div className="detail-metadata"><div><span className="metadata-icon"><Icon name="user" size={16} /></span><span><small>Assigned to</small><strong>{task.assignee?.name || 'Unassigned'}</strong></span></div><div><span className="metadata-icon"><Icon name="calendar" size={16} /></span><span><small>Due date</small><strong>{formatDateTime(task.eta)}</strong></span></div><div><span className="metadata-icon"><Icon name="briefcase" size={16} /></span><span><small>Category</small><strong>{task.category || 'General'}</strong></span></div><div><span className="metadata-icon"><Icon name="paperclip" size={16} /></span><span><small>Proof</small><strong>{task.proof_required ? 'Required' : 'Optional'}</strong></span></div></div><div className="detail-notes"><SectionHeader eyebrow="Handoff notes" title="Instructions" />{task.instructions ? <p>{task.instructions}</p> : <p className="muted-copy">No special instructions were added. Use the updates panel to add context as the work progresses.</p>}</div></section><aside className="detail-sidebar"><section className="panel update-panel"><SectionHeader eyebrow="Keep the loop closed" title="Add an update" description="Share progress, a blocker, or a completion note." /><form onSubmit={addRemark}><textarea className="input" rows="5" aria-label="Task update" placeholder="Write an update for the people following this task..." value={remark} onChange={(event) => setRemark(event.target.value)} /><button className="button button-primary button-full" type="submit" disabled={saving || !remark.trim()}>{saving ? 'Saving...' : 'Post update'}<Icon name="arrowUpRight" size={16} /></button></form></section><section className="panel activity-detail-panel"><SectionHeader eyebrow="Audit trail" title="Activity" />{updates.length ? <div className="timeline">{updates.map((update) => <div className="timeline-item" key={update.id}><span className="timeline-dot" /><div><div className="timeline-meta"><strong>{update.update_type === 'remark' ? 'Workspace update' : 'Status update'}</strong><small>{formatDateTime(update.created_at)}</small></div><p>{update.remark || `${update.update_type} recorded.`}</p>{update.proof_url && <a href={update.proof_url} target="_blank" rel="noreferrer">Open supporting file</a>}</div></div>)}</div> : <EmptyState compact icon="activity" title="No updates yet" description="The first remark or status change will appear here." />}</section></aside></div>
  </AppShell>;
}
