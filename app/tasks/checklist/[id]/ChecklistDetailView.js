'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ActivityFeed, postOptimisticUpdate } from '../../../../components/ActivityFeed';
import { pageContainerClass } from '../../../../components/AppShell';
import { Icon } from '../../../../components/Icons';
import { Spinner } from '../../../../components/Loader';
import { formatDate } from '../../../../components/UI';
import { ListEmpty, PersonChip, Property, PropertyList, StatusIcon, Surface } from '../../../../components/Workflow';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getCurrentEmployee, peekCurrentEmployee } from '../../../../lib/auth';
import { addChecklistItemUpdate, canCompleteChecklist, checklistFrequencies, formatChecklistDueAt, getChecklistStatus, setChecklistCompletion } from '../../../../lib/checklist-data';
import { isFreshRender, loadChecklistDetail } from '../../../../lib/page-data';

const statusLabels = { pending: 'Pending', overdue: 'Overdue', completed: 'Completed', deactivated: 'Deactivated' };
const statusNotes = {
  completed: 'This checklist item has been completed.',
  deactivated: 'Deactivated because its date is a non-working day.',
  overdue: 'The due time has passed and it is not complete.',
  pending: 'Due today or in the future.',
};

function frequencyLabel(value) {
  return checklistFrequencies.find((frequency) => frequency.value === value)?.label || 'Recurring checklist';
}

export default function ChecklistDetailView({ id, initialData, initialEmployee }) {
  const [item, setItem] = useState(initialData?.item || null);
  const [currentEmployee, setCurrentEmployee] = useState(() => initialEmployee || peekCurrentEmployee()?.employee || null);
  const [updates, setUpdates] = useState(initialData?.updates || []);
  const [loading, setLoading] = useState(!initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ({ background = false } = {}) => {
    if (!id) return;
    if (!background) setLoading(true);
    setError('');
    const { user, employee } = await getCurrentEmployee();
    if (!user || !employee) { setLoading(false); return; }
    setCurrentEmployee(employee);
    const response = await loadChecklistDetail({ id });
    if (response.error) setError(response.error.message);
    else { setItem(response.data.item); setUpdates(response.data.updates); }
    setLoading(false);
  }, [id]);

  useEffect(() => { if (!isFreshRender(initialData)) load({ background: Boolean(initialData) }); }, [initialData, load]);

  async function toggleCompletion() {
    const currentStatus = getChecklistStatus(item);
    if (!item || !canCompleteChecklist(currentEmployee?.role, currentEmployee?.id, item.employee_id) || currentStatus === 'deactivated') return;
    const previous = item;
    const completing = currentStatus !== 'completed';
    setSaving(true);
    setError('');
    setItem((current) => ({ ...current, status: completing ? 'completed' : 'pending', completed_at: completing ? new Date().toISOString() : null }));
    const { error: updateError } = await setChecklistCompletion(item.id, completing);
    if (updateError) { setItem(previous); setError(updateError.message); }
    else load({ background: true });
    setSaving(false);
  }

  async function addRemark(text) {
    setError('');
    const { user } = await getCurrentEmployee();
    if (!user) { setError('Your session has expired. Please sign in again.'); return false; }
    return postOptimisticUpdate({ text, setUpdates, setError, insert: (remarkText) => addChecklistItemUpdate(item.id, user.id, remarkText), refresh: () => load({ background: true }) });
  }

  const back = <Link href="/tasks?workType=checklist" className="inline-flex items-center gap-1 text-[14px] font-medium text-muted-foreground hover:text-foreground"><Icon name="chevronRight" size={14} className="rotate-180" />Checklist work</Link>;

  if (loading) return <div className={pageContainerClass}><div className="mb-4">{back}</div><div className="grid gap-3"><div className="h-8 w-2/3 rounded-md bg-muted" /><div className="h-4 w-1/2 rounded bg-muted" /><div className="mt-4 h-40 rounded-xl bg-muted/60" /></div></div>;
  if (!item) return <div className={pageContainerClass}><div className="mb-4">{back}</div><Surface><ListEmpty icon="checkSquare" title="This checklist item is unavailable" description={error || 'It may not have been generated yet or you may not have access to it.'} action={<Button asChild size="sm"><Link href="/tasks">Back to tasks</Link></Button>} /></Surface></div>;

  const status = getChecklistStatus(item);
  const canComplete = canCompleteChecklist(currentEmployee?.role, currentEmployee?.id, item.employee_id) && status !== 'deactivated';
  return <div className={pageContainerClass}>
    <div className="mb-4 flex items-center justify-between gap-3">
      {back}
      {canComplete && <Button size="sm" variant={status === 'completed' ? 'outline' : 'default'} className="h-8 gap-1.5" onClick={toggleCompletion} disabled={saving}>{saving ? <Spinner /> : <Icon name={status === 'completed' ? 'activity' : 'check'} size={15} />}{status === 'completed' ? 'Reopen' : 'Mark complete'}</Button>}
    </div>
    {error && <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-[14px] text-destructive" role="alert"><Icon name="warning" size={15} />{error}</div>}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
      <article className="min-w-0">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-brand/20 bg-brand-soft px-2 py-0.5 text-[13px] font-medium text-brand-dark"><Icon name="checkSquare" size={13} />Checklist</span>
        <h1 className="mt-3 text-[22px] leading-snug font-semibold tracking-tight text-foreground sm:text-[26px]">{item.task}</h1>
        <p className="mt-3 text-[15.5px] leading-relaxed text-foreground/80">Recurring work from the employee&apos;s active schedule. {statusNotes[status]}</p>
        <ActivityFeed updates={updates} onPost={addRemark} disabled={saving} />
      </article>
      <aside className="order-first grid content-start gap-4 lg:order-none">
        <Surface className="p-2">
          <PropertyList>
            <Property label="Status"><StatusIcon status={status} size={15} />{statusLabels[status]}</Property>
            <Property label="Assignee"><PersonChip name={item.employee?.name || 'Unknown employee'} /></Property>
            <Property label="Due"><span className={cn(status === 'overdue' && 'font-medium text-destructive')}>{formatChecklistDueAt(item.due_at, { includeYear: true })}</span></Property>
            <Property label="Frequency">{frequencyLabel(item.template?.frequency)}</Property>
            <Property label="Due time">{item.template?.due_time?.slice(0, 5) || '—'}</Property>
            <Property label="Rule starts">{formatDate(item.template?.start_date || item.due_date)}</Property>
          </PropertyList>
        </Surface>
      </aside>
    </div>
  </div>;
}
