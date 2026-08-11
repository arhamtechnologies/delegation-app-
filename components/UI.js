import Link from 'next/link';
import { Icon } from './Icons';
import { formatTaskDeadline, getTaskStatus } from '../lib/task-data';

export const statusMeta = {
  pending: { label: 'Pending', tone: 'blue', icon: 'clock' },
  overdue: { label: 'Overdue', tone: 'red', icon: 'warning' },
  completed: { label: 'Completed', tone: 'green', icon: 'checkCircle' },
};

export const priorityMeta = {
  normal: { label: 'Normal', tone: 'slate' },
  high: { label: 'High', tone: 'orange' },
  critical: { label: 'Critical', tone: 'red' },
};

export function StatusBadge({ status = 'pending', compact = false }) {
  const meta = statusMeta[status] || statusMeta.pending;
  return <span className={`badge badge-${meta.tone}${compact ? ' badge-compact' : ''}`}><Icon name={meta.icon} size={compact ? 13 : 14} />{meta.label}</span>;
}

export function PriorityBadge({ priority = 'normal' }) {
  const meta = priorityMeta[priority] || priorityMeta.normal;
  return <span className={`badge badge-${meta.tone} badge-compact`}><span className="priority-dot" />{meta.label}</span>;
}

export function Avatar({ name = 'User', size = 'md' }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U';
  return <span className={`avatar avatar-${size}`} aria-label={name}>{initials}</span>;
}

export function MetricCard({ label, value, change, tone = 'blue', icon = 'activity', href }) {
  const content = <div className={`metric-card metric-${tone}`}><div className="metric-card-top"><span className="metric-icon"><Icon name={icon} size={18} /></span>{change && <span className={`metric-change ${change.startsWith('-') ? 'negative' : ''}`}>{change}</span>}</div><div className="metric-value">{value}</div><div className="metric-label">{label}</div></div>;
  return href ? <Link href={href} className="metric-card-link">{content}</Link> : content;
}

export function EmptyState({ icon = 'inbox', title, description, action, href, compact = false }) {
  return <div className={`empty-state${compact ? ' empty-compact' : ''}`}><span className="empty-icon"><Icon name={icon} size={22} /></span><h3>{title}</h3>{description && <p>{description}</p>}{action && (href ? <Link href={href} className="button button-primary">{action}</Link> : <button className="button button-primary" type="button">{action}</button>)}</div>;
}

export function SectionHeader({ eyebrow, title, description, action, href }) {
  return <div className="section-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action && (href ? <Link className="button button-ghost button-small" href={href}>{action}<Icon name="arrowUpRight" size={15} /></Link> : action)}</div>;
}

export function ProgressBar({ value = 0, tone = 'blue' }) {
  return <div className="progress-track" aria-label={`${value}%`}><span className={`progress-fill progress-${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

export function Modal({ open, title, description, onClose, children, wide = false }) {
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></div>{children}</section></div>;
}

export function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value) return 'No date';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No date' : date.toLocaleDateString(undefined, options);
}

export function formatDateTime(value) {
  if (!value) return 'No date';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No date' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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
