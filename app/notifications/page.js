'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { EmptyState, formatDateTime, relativeTime } from '../../components/UI';
import { getAuthenticatedUser } from '../../lib/auth';
import { markNotificationRead, signalNotificationsChanged } from '../../lib/notifications';
import { supabaseBrowser } from '../../lib/supabase-browser';

function notificationType(kind) {
  return kind || 'update';
}

function notificationIcon(kind) {
  if (kind === 'assignment') return 'clipboard';
  if (kind === 'overdue') return 'warning';
  if (kind === 'deadline') return 'clock';
  return 'activity';
}

export default function Notifications() {
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [view, setView] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [openingId, setOpeningId] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      const user = await getAuthenticatedUser();
      if (!user) return;
      const { data, error: loadError } = await supabaseBrowser()
        .from('notifications')
        .select('id,task_id,kind,title,body,read_at,created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (loadError) {
        console.error('Unable to load notifications.', { code: loadError.code, message: loadError.message });
        if (active) {
          setNotifications([]);
          setError('Notifications are temporarily unavailable. Please try again shortly.');
          setLoading(false);
        }
        return;
      }
      if (active) {
        setNotifications((data || []).map((item) => ({
          id: item.id,
          type: notificationType(item.kind),
          title: item.title,
          description: item.body || 'A task notification is waiting for your attention.',
          taskId: item.task_id,
          date: item.created_at,
          readAt: item.read_at,
        })));
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const unread = useMemo(() => notifications.filter((item) => !item.readAt), [notifications]);
  const visibleNotifications = view === 'unread' ? unread : notifications;

  async function openNotification(item) {
    if (openingId) return;
    setActionError('');
    setOpeningId(item.id);
    if (!item.readAt) {
      const { error: updateError } = await markNotificationRead(item.id);
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
    if (item.taskId) router.push(`/tasks/${item.taskId}`);
  }

  return <AppShell title="Notifications" eyebrow="Workspace / Notifications" description="Stay close to the updates that keep work moving.">
    <section className="notification-summary"><div><span className="notification-summary-icon"><Icon name="bell" size={21} /></span><div><strong>Unread updates</strong><span>Latest changes across your workspace</span></div></div><span className="notification-summary-date">Updated just now</span></section>
    {actionError && <div className="form-error inline-alert error"><Icon name="warning" size={16} />{actionError}</div>}
    <section className="panel notifications-panel"><div className="notification-tabs"><button className={view === 'all' ? 'active' : ''} type="button" onClick={() => setView('all')}>All updates</button><button className={view === 'unread' ? 'active' : ''} type="button" onClick={() => setView('unread')}>Unread</button></div>{loading ? <div className="loading-list"><span /><span /><span /></div> : error ? <EmptyState icon="warning" title="Notifications unavailable" description={error} /> : visibleNotifications.length ? <div className="notification-list">{visibleNotifications.map((item) => { const isUnread = !item.readAt; return <button className={`notification-item${isUnread ? ' unread' : ''}`} key={item.id} type="button" onClick={() => openNotification(item)} disabled={openingId !== null} aria-label={`Open notification: ${item.title}`}><span className={`notification-icon notification-${item.type}`}><Icon name={notificationIcon(item.type)} size={17} /></span><span className="notification-copy"><span><strong>{item.title}</strong>{isUnread && <span className="unread-dot" />}</span><span>{item.description}</span><small>{relativeTime(item.date)} - {formatDateTime(item.date)}</small></span></button>; })}</div> : <EmptyState icon="bell" title={view === 'unread' ? 'No unread notifications' : 'You are all caught up'} description="Task assignments and updates will appear here." />}</section>
  </AppShell>;
}
