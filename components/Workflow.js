'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Dual } from 'loading-dev';
import { Icon } from './Icons';
import { cn } from '@/lib/utils';

// Linear-style building blocks shared by every list and detail screen.

const statusLabels = { pending: 'Pending', overdue: 'Overdue', completed: 'Completed', deactivated: 'Deactivated' };

export function StatusIcon({ status = 'pending', className, size = 16 }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', className: cn('shrink-0', className), role: 'img', 'aria-label': statusLabels[status] || 'Pending' };
  if (status === 'completed') return <svg {...common}><circle cx="8" cy="8" r="7" fill="var(--brand)" /><path d="m5 8.2 2 2 4-4.4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (status === 'overdue') return <svg {...common}><circle cx="8" cy="8" r="6.25" fill="none" stroke="var(--destructive)" strokeWidth="1.5" /><path d="M8 4.6v4" stroke="var(--destructive)" strokeWidth="1.6" strokeLinecap="round" /><circle cx="8" cy="11.1" r=".95" fill="var(--destructive)" /></svg>;
  if (status === 'deactivated') return <svg {...common}><circle cx="8" cy="8" r="6.25" fill="none" stroke="#a3a8b5" strokeWidth="1.5" /><path d="m5 11 6-6" stroke="#a3a8b5" strokeWidth="1.5" strokeLinecap="round" /></svg>;
  return <svg {...common}><circle cx="8" cy="8" r="6.25" fill="none" stroke="#9aa0ad" strokeWidth="1.5" /></svg>;
}

export function PriorityIcon({ priority = 'normal', className }) {
  if (priority === 'critical') return <span className={cn('inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-orange-500 text-[11px] leading-none font-bold text-white', className)} role="img" aria-label="Critical priority">!</span>;
  const filled = priority === 'high' ? 3 : 1;
  return <svg className={cn('size-4 shrink-0', className)} viewBox="0 0 16 16" role="img" aria-label={`${priority === 'high' ? 'High' : 'Normal'} priority`}>
    {[0, 1, 2].map((bar) => <rect key={bar} x={2.5 + bar * 4} y={10 - bar * 3} width="3" height={3 + bar * 3} rx="1" fill={bar < filled ? 'var(--foreground)' : '#d3d6dd'} opacity={bar < filled ? (priority === 'high' ? 0.85 : 0.55) : 1} />)}
  </svg>;
}

export function Kbd({ children, className }) {
  return <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[12px] font-medium text-muted-foreground', className)}>{children}</kbd>;
}

// A titled surface: Linear lists sit on one bordered panel with sections inside.
export function Surface({ className, children, ...props }) {
  return <section className={cn('min-w-0 overflow-hidden rounded-xl border border-border bg-background', className)} {...props}>{children}</section>;
}

export function SurfaceHeader({ title, description, actions, className }) {
  return <div className={cn('flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between', className)}>
    <div className="min-w-0">
      <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
      {description && <p className="mt-0.5 text-[14px] text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </div>;
}

// Search on its own line on phones; filter pills form one swipeable row instead of a tall stack.
export function Toolbar({ search, className, children }) {
  return <div className={cn('flex flex-col gap-2 border-b border-border px-3 py-2.5 sm:flex-row sm:items-center sm:px-4', className)}>
    {search}
    {children && <div className="no-scrollbar -mx-3 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">{children}</div>}
  </div>;
}

export function ToolbarSearch({ value, onChange, placeholder = 'Search', label, disabled, className }) {
  return <label className={cn('flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-muted-foreground focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15 max-sm:h-10 sm:w-72 sm:shrink-0', className)}>
    <Icon name="search" size={15} />
    <input className="h-full w-full min-w-0 border-0 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground/80 max-sm:text-base" aria-label={label || placeholder} placeholder={placeholder} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    {value && <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Clear search" onClick={() => onChange('')}><Icon name="close" size={14} /></button>}
  </label>;
}

// Native select keeps the OS picker on phones while looking like a Linear filter pill.
export function FilterSelect({ label, value, onChange, children, disabled, className }) {
  const active = value && value !== 'all';
  return <label className={cn('relative inline-flex h-8 shrink-0 items-center rounded-md border text-[14px] max-sm:h-9', active ? 'border-brand/30 bg-brand-soft text-brand-dark' : 'border-input bg-background text-foreground', className)}>
    <span className="pointer-events-none pl-2.5 text-muted-foreground">{label}</span>
    <select className="h-full max-w-[170px] min-w-0 cursor-pointer appearance-none border-0 bg-transparent pr-7 pl-1.5 font-medium outline-none max-sm:text-base" aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{children}</select>
    <Icon name="chevronDown" size={14} className="pointer-events-none absolute right-2 text-muted-foreground" />
  </label>;
}

export function FilterDate({ label, value, onChange, disabled }) {
  return <label className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[14px] max-sm:h-9', value ? 'border-brand/30 bg-brand-soft text-brand-dark' : 'border-input bg-background')}>
    <span className="text-muted-foreground">{label}</span>
    <input type="date" className="h-full w-[128px] min-w-0 border-0 bg-transparent font-medium outline-none max-sm:text-base" aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  </label>;
}

export function ClearFiltersButton({ visible, onClick }) {
  if (!visible) return null;
  return <button type="button" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[14px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground max-sm:h-9" onClick={onClick}><Icon name="close" size={14} />Clear</button>;
}

// Collapsible status group with a sticky header, like Linear's grouped issue lists.
export function ListGroup({ title, count, status, icon, defaultOpen = true, actions, onOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  function toggle() { if (!open) onOpen?.(); setOpen(!open); }
  return <div className="border-b border-border last:border-b-0">
    <div className="sticky top-0 z-[1] flex h-9 items-center gap-2 bg-muted/70 px-3 backdrop-blur-sm sm:px-4">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left text-[14px] font-medium text-foreground" aria-expanded={open} onClick={toggle}>
        <Icon name="chevronDown" size={14} className={cn('text-muted-foreground transition-transform', !open && '-rotate-90')} />
        {status ? <StatusIcon status={status} size={15} /> : icon}
        <span className="truncate">{title}</span>
        <span className="text-muted-foreground tabular-nums">{count}</span>
      </button>
      {actions}
    </div>
    {open && <ul className="divide-y divide-border/70">{children}</ul>}
  </div>;
}

// Column widths are shared by WorkRow and WorkColumnsHeader so headings line up with their cells.
const workColumn = { type: 'w-24', person: 'w-36', priority: 'w-20', extra: 'w-40', due: 'w-36', actions: 'w-8' };
const priorityLabels = { critical: 'Critical', high: 'High', normal: 'Normal' };

// Column headings for a work list; hidden on phones where rows stack instead.
export function WorkColumnsHeader({ showPerson = true, extraLabel, hasActions = false, className }) {
  return <div className={cn('hidden h-8 items-center gap-3 border-b border-border bg-muted/40 px-4 text-[13px] font-medium text-muted-foreground sm:flex', className)} role="presentation">
    <span className="w-4 shrink-0" />
    <span className="min-w-0 flex-1">Task</span>
    <span className={cn('shrink-0', workColumn.type)}>Type</span>
    {showPerson && <span className={cn('shrink-0', workColumn.person)}>Assigned to</span>}
    <span className={cn('shrink-0', workColumn.priority)}>Priority</span>
    {extraLabel && <span className={cn('shrink-0', workColumn.extra)}>{extraLabel}</span>}
    <span className={cn('shrink-0 text-right', workColumn.due)}>Due</span>
    {hasActions && <span className={cn('shrink-0', workColumn.actions)} />}
  </div>;
}

// One dense work row. On phones the cells collapse into a wrapped line under the title.
export function WorkRow({ href, status, priority, title, subtitle, type, person, due, dueTone, extra, meta, trailing, onStatusClick, statusBusy, statusLabel, className }) {
  const statusNode = <StatusIcon status={status} />;
  const titleClass = 'line-clamp-2 text-[15.5px] leading-snug font-medium text-foreground sm:block sm:truncate sm:text-[14.5px]';
  return <li className={cn('group relative flex min-h-11 items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/50 sm:px-4', className)}>
    {onStatusClick ? <button type="button" className="relative z-[2] -m-1.5 rounded-md p-1.5 hover:bg-muted disabled:opacity-50" aria-label={statusLabel} title={statusLabel} disabled={statusBusy} onClick={onStatusClick}>{statusNode}</button> : statusNode}
    {priority && <PriorityIcon priority={priority} className="sm:hidden" />}
    <div className="min-w-0 flex-1">
      {href ? <Link href={href} prefetch={false} className={cn(titleClass, 'after:absolute after:inset-0')}>{title}</Link> : <span className={titleClass}>{title}</span>}
      {subtitle && <span className="block truncate text-[13.5px] text-muted-foreground sm:hidden">{subtitle}</span>}
      {meta && <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-muted-foreground sm:hidden">{meta}</div>}
    </div>
    <span className={cn('hidden shrink-0 sm:block', workColumn.type)}>{type}</span>
    {person && <span className={cn('hidden min-w-0 shrink-0 text-[14px] text-foreground/85 sm:block', workColumn.person)}>{person}</span>}
    <span className={cn('hidden shrink-0 items-center gap-1.5 text-[14px] text-foreground/85 sm:flex', workColumn.priority)}>{priority ? <><PriorityIcon priority={priority} />{priorityLabels[priority] || 'Normal'}</> : <span className="text-muted-foreground">—</span>}</span>
    {extra && <span className={cn('hidden shrink-0 truncate text-[13.5px] text-muted-foreground sm:block', workColumn.extra)}>{extra}</span>}
    <span className={cn('hidden shrink-0 truncate text-right text-[13.5px] whitespace-nowrap text-muted-foreground tabular-nums sm:block', workColumn.due, dueTone === 'danger' && 'font-medium text-destructive')}>{due}</span>
    {trailing && <div className={cn('relative z-[2] flex shrink-0 items-center justify-end gap-1', workColumn.actions)}>{trailing}</div>}
  </li>;
}

export function MetaChip({ children, className }) {
  return <span className={cn('inline-flex h-6 max-w-[180px] items-center gap-1.5 truncate rounded-md border border-border px-2 text-[13px] text-muted-foreground', className)}>{children}</span>;
}

export function PersonChip({ name, className }) {
  const initials = String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
  return <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)} title={name}>
    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10.5px] font-semibold text-brand-dark">{initials}</span>
    <span className="truncate">{name}</span>
  </span>;
}

// Summary numbers in one strip instead of four heavy cards.
export function StatStrip({ items, className }) {
  return <div className={cn('grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-background sm:grid-cols-4', className)}>
    {items.map((item, index) => {
      const body = <>
        <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-muted-foreground">{item.status ? <StatusIcon status={item.status} size={14} /> : item.icon ? <Icon name={item.icon} size={14} /> : null}{item.label}</span>
        <span className={cn('mt-1.5 text-2xl font-semibold tracking-tight tabular-nums', item.tone === 'danger' && item.value ? 'text-destructive' : 'text-foreground')}>{item.value ?? '–'}</span>
        {item.hint && <span className="mt-0.5 truncate text-[13px] text-muted-foreground">{item.hint}</span>}
      </>;
      // Two columns on phones, four from sm up; borders follow whichever grid is active.
      const cellClass = cn('flex min-w-0 flex-col border-border px-4 py-3.5', index % 2 === 1 && 'border-l', index >= 2 && 'border-t sm:border-t-0', index === 2 && 'sm:border-l');
      return item.href ? <Link key={item.label} href={item.href} className={cn(cellClass, 'transition-colors hover:bg-muted/50')}>{body}</Link> : <div key={item.label} className={cellClass}>{body}</div>;
    })}
  </div>;
}

export function PropertyList({ children, className }) {
  return <dl className={cn('grid gap-0.5', className)}>{children}</dl>;
}

export function Property({ label, children }) {
  return <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3 rounded-md px-2 py-1.5 text-[14px] hover:bg-muted/50">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="flex min-w-0 items-center gap-1.5 text-foreground">{children}</dd>
  </div>;
}

export function ListEmpty({ icon = 'checkCircle', title, description, action }) {
  return <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
    <span className="mb-3 inline-flex size-10 items-center justify-center rounded-lg border border-border text-muted-foreground"><Icon name={icon} size={19} /></span>
    <p className="text-[15px] font-medium text-foreground">{title}</p>
    {description && <p className="mt-1 max-w-sm text-[14px] text-muted-foreground">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>;
}

// Shown while a list's request is in flight; height scales with the expected rows so the page doesn't jump.
export function ListSkeleton({ rows = 6, label = 'Loading…' }) {
  return <div className="flex flex-col items-center justify-center gap-3 text-[14px] text-muted-foreground" style={{ minHeight: `${Math.max(3, rows) * 44}px` }} role="status" aria-live="polite">
    <Dual size={40} color="var(--brand)" />
    <span>{label}</span>
  </div>;
}

export function InlineError({ message, onRetry }) {
  if (!message) return null;
  return <div className="flex flex-wrap items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-2.5 text-[14px] text-destructive" role="alert">
    <Icon name="warning" size={15} /><span className="min-w-0 flex-1">{message}</span>
    {onRetry && <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={onRetry}>Try again</button>}
  </div>;
}
