import Link from 'next/link';
import { Icon } from './Icons';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatTaskDeadline, getTaskStatus } from '../lib/task-data';

export const statusMeta = {
  pending: { label: 'Pending', tone: 'purple', icon: 'clock' },
  overdue: { label: 'Overdue', tone: 'red', icon: 'warning' },
  completed: { label: 'Completed', tone: 'green', icon: 'checkCircle' },
  deactivated: { label: 'Deactivated', tone: 'slate', icon: 'close' },
};

export const priorityMeta = {
  normal: { label: 'Normal', tone: 'slate' },
  high: { label: 'High', tone: 'orange' },
  critical: { label: 'Critical', tone: 'red' },
};

// One soft tint per tone keeps badges, metric icons and pills in the same calm palette.
export const toneClasses = {
  purple: 'bg-brand-soft text-brand-dark',
  blue: 'bg-sky-50 text-sky-700',
  red: 'bg-red-50 text-red-700',
  green: 'bg-emerald-50 text-emerald-700',
  mint: 'bg-emerald-50 text-emerald-700',
  orange: 'bg-amber-50 text-amber-700',
  violet: 'bg-violet-50 text-violet-700',
  slate: 'bg-muted text-muted-foreground',
};

export function StatusBadge({ status = 'pending', compact = false }) {
  const meta = statusMeta[status] || statusMeta.pending;
  return <Badge className={cn('badge h-6 gap-1 px-2 text-xs font-semibold', compact && 'h-[22px] px-1.5 text-[12px]', toneClasses[meta.tone])}><Icon name={meta.icon} size={compact ? 13 : 14} />{meta.label}</Badge>;
}

export function PriorityBadge({ priority = 'normal' }) {
  const meta = priorityMeta[priority] || priorityMeta.normal;
  return <Badge className={cn('badge h-[22px] gap-1.5 px-2 text-[12px] font-semibold', toneClasses[meta.tone])}><span className="size-1.5 rounded-full bg-current" />{meta.label}</Badge>;
}

export const roleMeta = {
  super_admin: { label: 'Super admin', tone: 'purple' },
  assigner: { label: 'Assigner', tone: 'blue' },
  ea: { label: 'Executive assistant', tone: 'violet' },
  doer: { label: 'Doer', tone: 'slate' },
};

export function roleLabel(role) {
  return roleMeta[role]?.label || 'Workspace member';
}

export function RoleBadge({ role }) {
  const meta = roleMeta[role] || roleMeta.doer;
  return <Badge className={cn('badge h-[22px] w-fit shrink-0 gap-1.5 px-2 text-[12px] font-semibold whitespace-nowrap', toneClasses[meta.tone])}><span className="size-1.5 rounded-full bg-current" />{meta.label}</Badge>;
}

export function Avatar({ name = 'User', size = 'md' }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U';
  return <span className={`avatar avatar-${size}`} aria-label={name}>{initials}</span>;
}

export function MetricCard({ label, value, change, tone = 'blue', icon = 'activity', href }) {
  const content = <Card className={cn('metric-card h-full gap-0 p-4 shadow-none ring-border sm:p-5', href && 'transition hover:-translate-y-0.5 hover:shadow-md hover:ring-brand/25')}>
    <span className={cn('inline-flex size-9 items-center justify-center rounded-lg', toneClasses[tone] || toneClasses.blue)}><Icon name={icon} size={18} /></span>
    <div className="mt-4 text-[28px] leading-none font-semibold tracking-tight text-foreground tabular-nums sm:text-3xl">{value}</div>
    <div className="mt-1.5 text-sm font-medium text-foreground/80">{label}</div>
    {change && <div className={cn('mt-0.5 text-xs', change.startsWith('-') ? 'text-destructive' : 'text-muted-foreground')}>{change}</div>}
  </Card>;
  return href ? <Link href={href} className="block min-w-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40">{content}</Link> : content;
}

export function EmptyState({ icon = 'inbox', title, description, action, href, onAction, compact = false }) {
  return <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', compact ? 'min-h-44' : 'min-h-64')}>
    <span className="mb-3 inline-flex size-12 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon name={icon} size={22} /></span>
    <h3 className="mb-1 text-base font-semibold text-foreground">{title}</h3>
    {description && <p className="mb-4 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>}
    {action && (href ? <Button asChild className="h-10 px-4"><Link href={href}>{action}</Link></Button> : <Button className="h-10 px-4" type="button" onClick={onAction}>{action}</Button>)}
  </div>;
}

export function SectionHeader({ eyebrow, title, description, action, href }) {
  return <div className="section-header mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0">
      {eyebrow && <div className="mb-1 text-[12px] font-semibold tracking-[.08em] text-brand uppercase">{eyebrow}</div>}
      <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">{title}</h2>
      {description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}
    </div>
    {action && (href ? <Button asChild variant="outline" className="h-9 shrink-0 self-start"><Link href={href}>{action}<Icon name="arrowUpRight" size={15} /></Link></Button> : <div className="shrink-0">{action}</div>)}
  </div>;
}

export function ProgressBar({ value = 0, tone = 'blue' }) {
  return <div className="progress-track" aria-label={`${value}%`}><span className={`progress-fill progress-${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

// Phones keep focus on the sheet itself so the keyboard does not cover the form the moment it opens.
function focusDialogOnDesktop(event) {
  if (!window.matchMedia('(max-width: 639px)').matches) return;
  event.preventDefault();
  event.currentTarget?.focus?.();
}

// On phones the dialog docks to the bottom edge like a sheet so long forms stay reachable.
export function Modal({ open, title, description, onClose, children, wide = false }) {
  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
    <DialogContent onOpenAutoFocus={focusDialogOnDesktop} className={cn('max-h-[92dvh] gap-0 overflow-y-auto overscroll-contain p-5 shadow-xl sm:p-6', wide ? 'sm:max-w-[690px]' : 'sm:max-w-[520px]', 'max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] max-sm:data-open:slide-in-from-bottom-8 max-sm:data-open:zoom-in-100')}>
      <DialogHeader className="mb-5 pr-8 text-left">
        <DialogTitle className="text-lg font-semibold tracking-tight">{title}</DialogTitle>
        {description ? <DialogDescription className="text-sm leading-relaxed">{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
      </DialogHeader>
      {children}
    </DialogContent>
  </Dialog>;
}

// Workspace time zone keeps server and browser output identical (no hydration drift).
const WORKSPACE_TIME_ZONE = 'Asia/Kolkata';

export function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value) return 'No date';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00+05:30`) : new Date(value);
  return Number.isNaN(date.getTime()) ? 'No date' : date.toLocaleDateString('en-US', { timeZone: WORKSPACE_TIME_ZONE, ...options });
}

export function formatDateTime(value) {
  if (!value) return 'No date';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No date' : date.toLocaleString('en-US', { timeZone: WORKSPACE_TIME_ZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function relativeTime(value) {
  if (!value) return 'No activity';
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return 'No activity';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function TaskRow({ task }) {
  const status = getTaskStatus(task);
  return <div className="task-row"><div className="task-row-main"><span className="task-check"><Icon name={status === 'completed' ? 'checkCircle' : 'clipboard'} size={18} /></span><div className="task-copy"><Link href={`/tasks/${task.id}`} className="task-title">{task.title}</Link><div className="task-subline"><span>{task.assignee?.name || 'Unassigned'}</span><span className="dot-separator" />{task.category || 'General'}</div></div></div><div className="task-row-meta"><PriorityBadge priority={task.priority} /><StatusBadge status={status} compact /><span className={status === 'overdue' ? 'due-date overdue' : 'due-date'}><Icon name="calendar" size={14} />{formatTaskDeadline(task)}</span></div></div>;
}
