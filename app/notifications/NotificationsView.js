'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { Spinner } from '../../components/Loader';
import { formatDateTime, relativeTime } from '../../components/UI';
import { InlineError, ListEmpty, ListSkeleton, Surface } from '../../components/Workflow';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getCurrentEmployee } from '../../lib/auth';
import { markAllNotificationsRead, markNotificationRead, signalNotificationsChanged } from '../../lib/notifications';
import { isFreshRender, loadNotificationsPage } from '../../lib/page-data';

const tabs = [['all', 'All'], ['unread', 'Unread'], ['read', 'Read']];

function notificationIcon(kind) {
  if (kind === 'task_created' || kind === 'checklist_created') return kind === 'checklist_created' ? 'checkSquare' : 'clipboard';
  if (kind === 'task_completed' || kind === 'checklist_completed') return 'checkCircle';
  if (kind === 'checklist_deactivated') return 'close';
  if (kind === 'task_updated' || kind === 'checklist_updated' || kind === 'checklist_bulk_updated') return 'edit';
  return 'activity';
}

function notificationHref(item) {
  if (item.entityType === 'checklist_item' && item.entityId) return `/tasks/checklist/${item.entityId}`;
  if ((item.entityType === 'task' && item.entityId) || item.taskId) return `/tasks/${item.entityId || item.taskId}`;
  if (item.entityType === 'checklist_template') return '/checklist';
  return null;
}

export default function NotificationsView({ initialData }) {
  const router = useRouter();
  const [employee, setEmployee] = useState(initialData?.employee || null);
  const [notifications, setNotifications] = useState(initialData?.notifications || []);
  const [view, setView] = useState('all');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(initialData?.totalPages || 1);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);
  const skipFirstLoadRef = useRef(Boolean(initialData));

  const loadNotifications = useCallback(async ({ background = false } = {}) => {
    const { user, employee: currentEmployee } = await getCurrentEmployee();
    if (!user || !currentEmployee) { setLoading(false); return; }
    setEmployee(currentEmployee);
    if (!background) setLoading(true);
    setError('');
    const response = await loadNotificationsPage({ employee: currentEmployee, view, page });
    if (response.error) {
      console.error('Unable to load notifications.', { code: response.error.code, message: response.error.message });
      setError('Notifications are temporarily unavailable. Please try again shortly.');
    } else {
      setNotifications(response.data.notifications);
      setTotalPages(response.data.totalPages);
    }
    setLoading(false);
  }, [page, view]);

  useEffect(() => {
    if (skipFirstLoadRef.current) { skipFirstLoadRef.current = false; if (isFreshRender(initialData)) return; loadNotifications({ background: true }); return; }
    loadNotifications();
  }, [initialData, loadNotifications]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') loadNotifications({ background: true }); };
    // Realtime inserts (via AppFrame) and returning to the tab trigger refreshes; no polling.
    window.addEventListener('notifications:changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('notifications:changed', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [loadNotifications]);

  function changeView(nextView) { setView(nextView); setPage(0); }

  // Navigate straight away; marking as read happens in the background.
  function openNotification(item) {
    setActionError('');
    if (!item.readAt) {
      setNotifications((current) => current.map((notification) => notification.id === item.id ? { ...notification, readAt: new Date().toISOString() } : notification));
      markNotificationRead(item.id, employee?.id).then(({ error: updateError }) => {
        if (updateError) console.error('Unable to mark notification as read.', { code: updateError.code, message: updateError.message });
        else signalNotificationsChanged();
      });
    }
    const href = notificationHref(item);
    if (href) router.push(href);
  }

  async function markAllRead() {
    if (!employee || markingAll) return;
    const previous = notifications;
    setMarkingAll(true);
    setActionError('');
    const readAt = new Date().toISOString();
    setNotifications((current) => (view === 'unread' ? [] : current.map((notification) => ({ ...notification, readAt: notification.readAt || readAt }))));
    const { error: updateError } = await markAllNotificationsRead(employee.id);
    if (updateError) {
      console.error('Unable to mark all notifications as read.', { code: updateError.code, message: updateError.message });
      setNotifications(previous);
      setActionError('Notifications could not be marked as read.');
    } else {
      signalNotificationsChanged();
    }
    setMarkingAll(false);
  }

  const unreadOnPage = notifications.filter((item) => !item.readAt).length;
  return <AppShell title="Notifications" description="Assignments, checklist activity, and completions." actions={<Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={markAllRead} disabled={markingAll || !employee || !unreadOnPage}>{markingAll ? <Spinner /> : <Icon name="check" size={15} />}Mark all read</Button>}>
    <Surface>
      <div className="flex items-center gap-1 border-b border-border px-2 py-2 sm:px-3" role="tablist" aria-label="Notification filter">
        {tabs.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => changeView(value)} className={cn('h-8 rounded-md px-3 text-[14px] font-medium transition-colors', view === value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')}>{label}{value === 'unread' && unreadOnPage > 0 && <span className="ml-1.5 rounded-full bg-brand px-1.5 py-px text-[12px] text-white tabular-nums">{unreadOnPage}</span>}</button>)}
      </div>
      <InlineError message={actionError} />
      {!loading && !error && notifications.length > 0 && <div className="hidden h-8 items-center gap-3 border-b border-border bg-muted/40 px-4 text-[13px] font-medium text-muted-foreground sm:flex"><span className="w-[52px] shrink-0" /><span className="flex-1">Notification</span><span>Received</span></div>}
      {loading ? <ListSkeleton rows={8} /> : error ? <ListEmpty icon="warning" title="Notifications unavailable" description={error} action={<Button variant="outline" size="sm" onClick={() => loadNotifications()}>Try again</Button>} /> : notifications.length ? <ul className="divide-y divide-border/70">
        {notifications.map((item) => {
          const unread = !item.readAt;
          return <li key={item.id}>
            <button type="button" className={cn('flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50 sm:px-4', unread && 'bg-brand-soft/30')} onClick={() => openNotification(item)} aria-label={`Open notification: ${item.title}`}>
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', unread ? 'bg-brand' : 'bg-transparent')} aria-hidden="true" />
              <span className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border', unread ? 'bg-background text-brand' : 'text-muted-foreground')}><Icon name={notificationIcon(item.type)} size={16} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3"><span className={cn('truncate text-[15px]', unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/85')}>{item.title}</span><span className="shrink-0 text-[13px] text-muted-foreground" title={formatDateTime(item.date)} suppressHydrationWarning>{relativeTime(item.date)}</span></span>
                <span className="mt-0.5 line-clamp-2 text-[14px] text-muted-foreground">{item.description}</span>
              </span>
            </button>
          </li>;
        })}
      </ul> : <ListEmpty icon="bell" title={view === 'unread' ? 'No unread notifications' : view === 'read' ? 'No read notifications' : 'Inbox zero'} description="Task assignments and checklist activity will appear here." />}
      {!loading && !error && totalPages > 1 && <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-[14px] text-muted-foreground"><span className="tabular-nums">Page {page + 1} of {totalPages}</span><div className="flex gap-1.5"><Button variant="outline" size="sm" className="h-8" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>Previous</Button><Button variant="outline" size="sm" className="h-8" onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))} disabled={page + 1 >= totalPages}>Next</Button></div></div>}
    </Surface>
  </AppShell>;
}
