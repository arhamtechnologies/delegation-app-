'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { EmptyState, formatDateTime, relativeTime } from '../../components/UI';
import { getCurrentEmployee } from '../../lib/auth';
import { markAllNotificationsRead, markNotificationRead, signalNotificationsChanged } from '../../lib/notifications';
import { supabaseBrowser } from '../../lib/supabase-browser';

const pageSize = 30;

function notificationType(kind) {
  if (kind === 'assignment') return 'task_created';
  if (kind === 'update') return 'task_updated';
  return kind || 'task_updated';
}

function notificationIcon(kind) {
  if (kind === 'task_created' || kind === 'checklist_created') return kind === 'checklist_created' ? 'checkSquare' : 'clipboard';
  if (kind === 'task_completed' || kind === 'checklist_completed') return 'checkCircle';
  if (kind === 'checklist_deactivated') return 'close';
  if (kind === 'task_updated' || kind === 'checklist_updated' || kind === 'checklist_bulk_updated') return 'edit';
  return 'activity';
}

function notificationClass(kind) {
  if (kind.startsWith('checklist')) return 'notification-checklist';
  if (kind === 'task_completed') return 'notification-completed';
  if (kind === 'task_created') return 'notification-assignment';
  return 'notification-update';
}

export default function Notifications() {
  const router = useRouter();
  const [employee, setEmployee] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [view, setView] = useState('all');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [openingId, setOpeningId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    const { user, employee: currentEmployee } = await getCurrentEmployee();
    if (!user || !currentEmployee) {
      setLoading(false);
      return;
    }
    setEmployee(currentEmployee);
    setLoading(true);
    setError('');
    function buildQuery(select) {
      let query = supabaseBrowser()
        .from('notifications')
        .select(select, { count: 'exact' })
        .eq('recipient_employee_id', currentEmployee.id)
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (view === 'unread') query = query.is('read_at', null);
      if (view === 'read') query = query.not('read_at', 'is', null);
      return query;
    }
    let result = await buildQuery('id,task_id,kind,title,body,entity_type,entity_id,read_at,created_at');
    if (result.error && /entity_type|entity_id|schema cache|column/i.test(result.error.message || '')) result = await buildQuery('id,task_id,kind,title,body,read_at,created_at');
    const { data, error: loadError, count } = result;
    if (loadError) {
      console.error('Unable to load notifications.', { code: loadError.code, message: loadError.message });
      setNotifications([]);
      setError('Notifications are temporarily unavailable. Please try again shortly.');
    } else {
      setNotifications((data || []).map((item) => ({
        id: item.id,
        type: notificationType(item.kind),
        title: item.title,
        description: item.body || 'A workspace notification is waiting for your attention.',
        taskId: item.task_id,
        entityType: item.entity_type,
        entityId: item.entity_id,
        date: item.created_at,
        readAt: item.read_at,
      })));
      setTotalPages(Math.max(1, Math.ceil((count || 0) / pageSize)));
    }
    setLoading(false);
  }, [page, view]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  useEffect(() => {
    const refresh = () => loadNotifications();
    window.addEventListener('notifications:changed', refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      window.removeEventListener('notifications:changed', refresh);
      window.clearInterval(timer);
    };
  }, [loadNotifications]);

  function changeView(nextView) {
    setView(nextView);
    setPage(0);
  }

  async function openNotification(item) {
    if (openingId) return;
    setActionError('');
    setOpeningId(item.id);
    if (!item.readAt) {
      const { error: updateError } = await markNotificationRead(item.id, employee?.id);
      if (updateError) {
        console.error('Unable to mark notification as read.', { code: updateError.code, message: updateError.message });
        setActionError('That notification could not be marked as read.');
        setOpeningId(null);
        return;
      }
      setNotifications((current) => current.map((notification) => notification.id === item.id ? { ...notification, readAt: new Date().toISOString() } : notification));
      signalNotificationsChanged();
    }
    setOpeningId(null);
    if (item.entityType === 'checklist_item' && item.entityId) router.push(`/tasks/checklist/${item.entityId}`);
    else if ((item.entityType === 'task' && item.entityId) || item.taskId) router.push(`/tasks/${item.entityId || item.taskId}`);
    else if (item.entityType === 'checklist_template') router.push('/checklist');
  }

  async function markAllRead() {
    if (!employee || markingAll) return;
    setMarkingAll(true);
    setActionError('');
    const { error: updateError } = await markAllNotificationsRead(employee.id);
    if (updateError) {
      console.error('Unable to mark all notifications as read.', { code: updateError.code, message: updateError.message });
      setActionError('Notifications could not be marked as read.');
    } else {
      signalNotificationsChanged();
      await loadNotifications();
    }
    setMarkingAll(false);
  }

  const unreadOnPage = notifications.filter((item) => !item.readAt).length;
  return <AppShell title="Notifications" eyebrow="Workspace / Notifications" description="Stay updated on tasks and checklist activity.">
    <section className="notification-summary"><div><span className="notification-summary-icon"><Icon name="bell" size={21} /></span><div><strong>Workspace updates</strong><span>Assignments, checklist activity, and completions</span></div></div><div className="notification-summary-actions">{unreadOnPage > 0 && <span className="notification-summary-date">{unreadOnPage} unread on this page</span>}<button className="button button-ghost button-small" type="button" onClick={markAllRead} disabled={markingAll || !employee}>{markingAll ? 'Marking...' : 'Mark all as read'}</button></div></section>
    {actionError && <div className="form-error inline-alert error"><Icon name="warning" size={16} />{actionError}</div>}
    <section className="panel notifications-panel"><div className="notification-tabs"><button className={view === 'all' ? 'active' : ''} type="button" onClick={() => changeView('all')}>All</button><button className={view === 'unread' ? 'active' : ''} type="button" onClick={() => changeView('unread')}>Unread</button><button className={view === 'read' ? 'active' : ''} type="button" onClick={() => changeView('read')}>Read</button></div>{loading ? <div className="loading-list"><span /><span /><span /></div> : error ? <EmptyState icon="warning" title="Notifications unavailable" description={error} /> : notifications.length ? <div className="notification-list">{notifications.map((item) => { const isUnread = !item.readAt; return <button className={`notification-item${isUnread ? ' unread' : ''}`} key={item.id} type="button" onClick={() => openNotification(item)} disabled={openingId !== null} aria-label={`Open notification: ${item.title}`}><span className={`notification-icon ${notificationClass(item.type)}`}><Icon name={notificationIcon(item.type)} size={17} /></span><span className="notification-copy"><span><strong>{item.title}</strong>{isUnread && <span className="unread-dot" />}</span><span>{item.description}</span><small>{relativeTime(item.date)} · {formatDateTime(item.date)}</small></span><span className="notification-action"><Icon name="chevronRight" size={16} /></span></button>; })}</div> : <EmptyState icon="bell" title={view === 'unread' ? 'No unread notifications' : view === 'read' ? 'No read notifications' : 'You are all caught up'} description="Task assignments and checklist activity will appear here." />}{!loading && !error && totalPages > 1 && <div className="notification-pagination"><button className="button button-ghost button-small" type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>Previous</button><span>Page {page + 1} of {totalPages}</span><button className="button button-ghost button-small" type="button" onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))} disabled={page + 1 >= totalPages}>Next</button></div>}</section>
  </AppShell>;
}
