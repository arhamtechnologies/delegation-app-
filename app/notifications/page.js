import NotificationsView from './NotificationsView';
import { loadNotificationsPage, withRenderTime } from '../../lib/page-data';
import { getServerSession } from '../../lib/server-session';

export const metadata = { title: 'Inbox' };

export default async function NotificationsPage() {
  const session = await getServerSession();
  const initial = session ? await loadNotificationsPage({ employee: session.employee, client: session.client }).catch(() => null) : null;
  return <NotificationsView initialData={withRenderTime(initial?.data || null)} />;
}
