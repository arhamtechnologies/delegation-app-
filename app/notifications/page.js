'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/Icons';
import { EmptyState, StatusBadge, formatDateTime, relativeTime } from '../../components/UI';
import { getTasks, taskIsDueSoon, taskIsOverdue } from '../../lib/task-data';
import { supabaseBrowser } from '../../lib/supabase-browser';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [read, setRead] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: updates = [] } = {}, { data: tasks = [] } = {}] = await Promise.all([
        supabaseBrowser().from('task_updates').select('id,task_id,remark,update_type,created_at').order('created_at', { ascending: false }).limit(30),
        getTasks({ limit: 100 }),
      ]);
      const updateNotifications = (updates || []).map((item) => ({ id: `update-${item.id}`, type: 'update', title: item.update_type === 'remark' ? 'New task update' : 'Task status changed', description: item.remark || 'A task was updated.', taskId: item.task_id, date: item.created_at }));
      const taskNotifications = (tasks || []).filter((task) => taskIsOverdue(task) || taskIsDueSoon(task)).slice(0, 8).map((task) => ({ id: `task-${task.id}`, type: taskIsOverdue(task) ? 'overdue' : 'deadline', title: taskIsOverdue(task) ? 'Task is overdue' : 'Deadline approaching', description: task.title, taskId: task.id, date: task.eta }));
      if (active) { setNotifications([...updateNotifications, ...taskNotifications].sort((a, b) => new Date(b.date) - new Date(a.date))); setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const unread = useMemo(() => notifications.filter((item) => !read.includes(item.id)), [notifications, read]);
  function markAll() { setRead(notifications.map((item) => item.id)); }

  return <AppShell title="Notifications" eyebrow="Workspace / Notifications" description="Stay close to the updates that keep work moving." actions={<button className="button button-ghost button-small" type="button" onClick={markAll}><Icon name="checkCircle" size={15} />Mark all read</button>}>
    <section className="notification-summary"><div><span className="notification-summary-icon"><Icon name="bell" size={21} /></span><div><strong>{unread.length} unread updates</strong><span>Latest changes across your workspace</span></div></div><span className="notification-summary-date">Updated just now</span></section>
    <section className="panel notifications-panel"><div className="notification-tabs"><button className="active" type="button">All updates <span>{notifications.length}</span></button><button type="button">Unread <span>{unread.length}</span></button></div>{loading ? <div className="loading-list"><span /><span /><span /></div> : notifications.length ? <div className="notification-list">{notifications.map((item) => { const isUnread = !read.includes(item.id); return <div className={`notification-item${isUnread ? ' unread' : ''}`} key={item.id}><span className={`notification-icon notification-${item.type}`}><Icon name={item.type === 'overdue' ? 'warning' : item.type === 'deadline' ? 'clock' : 'activity'} size={17} /></span><div className="notification-copy"><div><strong>{item.title}</strong>{isUnread && <span className="unread-dot" />}</div><p>{item.description}</p><small>{relativeTime(item.date)} · {formatDateTime(item.date)}</small></div>{item.taskId && <Link href={`/tasks/${item.taskId}`} className="notification-action" onClick={() => setRead((current) => [...current, item.id])}>View task <Icon name="arrowUpRight" size={14} /></Link>}</div>; })}</div> : <EmptyState icon="bell" title="You are all caught up" description="Task changes, remarks, and deadline reminders will appear here." />}</section>
  </AppShell>;
}
