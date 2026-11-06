'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAccessToken } from '../lib/auth';
import { formatChecklistDays, formatChecklistTime } from '../lib/checklist-data';
import { formatChecklistDate } from '../lib/checklist-time';
import { InlineError, Surface, SurfaceHeader } from './Workflow';

export default function AssignedChecklists() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/checklist/assigned', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) setResult(payload);
      else setError(payload.error || 'Your assigned checklists could not be loaded.');
    } catch {
      setError('Your assigned checklists could not be loaded.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <Surface><InlineError message={error} onRetry={load} /></Surface>;
  if (!result?.checklists?.length) return null;

  return <Surface>
    <SurfaceHeader title="My assigned checklists" description="Everything assigned to you. Each one joins your to-do list and dashboard on its due day." />
    <ul className="divide-y divide-border/70">{result.checklists.map((checklist) => <li key={checklist.id} className="flex min-h-12 items-center gap-3 px-3 py-2 sm:px-4">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-foreground sm:text-[14.5px]">{checklist.task}</p>
        {checklist.proof_required && <span className="mt-0.5 inline-flex items-center gap-1 rounded border border-brand/20 bg-brand-soft px-1.5 text-[12px] font-medium text-brand-dark">Proof mandatory</span>}
        <span className="mt-0.5 block text-[13.5px] text-muted-foreground">{formatChecklistDays(checklist)} · {formatChecklistTime(checklist.due_time)}</span>
      </div>
      <span className="shrink-0 text-right">
        <span className="block text-[12.5px] text-muted-foreground">Next due</span>
        <span className="block text-[14px] font-medium text-foreground/90">{formatChecklistDate(checklist.next_due_date, result.today)}</span>
      </span>
    </li>)}</ul>
  </Surface>;
}
