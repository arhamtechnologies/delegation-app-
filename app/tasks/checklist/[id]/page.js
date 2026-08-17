'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import AppShell from '../../../../components/AppShell';
import { Icon } from '../../../../components/Icons';
import { EmptyState, SectionHeader, StatusBadge } from '../../../../components/UI';
import { getCurrentEmployee } from '../../../../lib/auth';
import { canCompleteChecklist, checklistFrequencies, formatChecklistDueAt, getChecklistStatus, setChecklistCompletion } from '../../../../lib/checklist-data';
import { supabaseBrowser } from '../../../../lib/supabase-browser';

function frequencyLabel(value) {
  return checklistFrequencies.find((frequency) => frequency.value === value)?.label || 'Recurring checklist';
}

export default function ChecklistTaskDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [currentEmployee, setCurrentEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    const { user, employee } = await getCurrentEmployee();
    if (!user || !employee) { setLoading(false); return; }
    const { data, error: itemError } = await supabaseBrowser()
      .from('checklist_items')
      .select('id,template_id,employee_id,task,due_date,due_at,status,completed_at,completed_by,employee:employees!checklist_items_employee_id_fkey(id,name,email),template:checklist_templates!checklist_items_template_id_fkey(frequency,weekday,day_of_month,monthly_days,start_date,due_time)')
      .eq('id', id)
      .maybeSingle();
    if (itemError) setError(itemError.message);
    setItem(data || null);
    setCurrentEmployee(employee);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function complete() {
    if (!item || !canCompleteChecklist(currentEmployee?.role, currentEmployee?.id, item.employee_id) || getChecklistStatus(item) === 'completed') return;
    setSaving(true);
    setError('');
    const { error: updateError } = await setChecklistCompletion(item.id);
    if (updateError) setError(updateError.message);
    else await load();
    setSaving(false);
  }

  if (loading) return <AppShell title="Checklist details" eyebrow="Workspace / Tasks"><div className="panel detail-loading"><div className="loading-list"><span /><span /><span /></div></div></AppShell>;
  if (!item) return <AppShell title="Checklist not found" eyebrow="Workspace / Tasks"><EmptyState icon="checkSquare" title="This checklist item is unavailable" description={error || 'It may not have been generated yet or you may not have access to it.'} action="Back to tasks" href="/tasks" /></AppShell>;

  const status = getChecklistStatus(item);
  const canComplete = canCompleteChecklist(currentEmployee?.role, currentEmployee?.id, item.employee_id) && status !== 'deactivated';
  return <AppShell title="Checklist details" eyebrow="Workspace / Tasks" actions={<Link className="button button-ghost button-small" href="/tasks"><Icon name="chevronRight" size={15} className="flip-icon" />Back to tasks</Link>}>
    {error && <div className="inline-alert error"><Icon name="warning" size={16} />{error}</div>}
    <div className="detail-layout">
      <section className="panel task-detail-main">
        <div className="detail-topline"><div className="detail-tags"><span className="task-source-badge"><Icon name="checkSquare" size={13} />Checklist</span></div><StatusBadge status={status} /></div>
        <h2 className="detail-title">{item.task}</h2>
        <p className="detail-description">Recurring checklist work assigned from the employee&apos;s active schedule.</p>
        <div className="automatic-status-panel"><span className="automatic-status-label">Automatic status</span><StatusBadge status={status} /><p>{status === 'completed' ? 'This checklist item has been completed.' : status === 'deactivated' ? 'This checklist item was deactivated because its date is a non-working day.' : status === 'overdue' ? 'The due time has passed and the checklist item is not complete.' : 'The checklist item is due today or in the future.'}</p></div>
        <div className="detail-metadata">
          <div><span className="metadata-icon"><Icon name="user" size={16} /></span><span><small>Employee</small><strong>{item.employee?.name || 'Unknown employee'}</strong></span></div>
          <div><span className="metadata-icon"><Icon name="list" size={16} /></span><span><small>Frequency</small><strong>{frequencyLabel(item.template?.frequency)}</strong></span></div>
          <div><span className="metadata-icon"><Icon name="calendar" size={16} /></span><span><small>Due</small><strong>{formatChecklistDueAt(item.due_at, { includeYear: true })}</strong></span></div>
          <div><span className="metadata-icon"><Icon name="clock" size={16} /></span><span><small>Schedule</small><strong>{item.template?.due_time?.slice(0, 5) || '—'}</strong></span></div>
        </div>
        <div className="detail-notes"><SectionHeader eyebrow="Checklist source" title="Recurring rule" /><p>{frequencyLabel(item.template?.frequency)} · {item.template?.start_date || item.due_date}</p></div>
      </section>
      <aside className="detail-sidebar">
        {canComplete && <section className="panel completion-panel"><SectionHeader eyebrow="Close the loop" title="Complete checklist item" description="Completion updates the same checklist record shown on the Checklist page." /><button className="button button-primary button-full" type="button" onClick={complete} disabled={saving || status === 'completed'}><Icon name={status === 'completed' ? 'checkCircle' : 'check'} size={16} />{saving ? 'Saving...' : status === 'completed' ? 'Completed' : 'Mark complete'}</button></section>}
      </aside>
    </div>
  </AppShell>;
}
