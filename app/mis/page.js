import MisView from './MisView';
import { loadMisData, withRenderTime } from '../../lib/page-data';
import { redirect } from 'next/navigation';
import { canCreateTasks } from '../../lib/auth';
import { getServerSession } from '../../lib/server-session';

export const metadata = { title: 'MIS reports' };

export default async function MisPage() {
  const session = await getServerSession();
  // Managers only; doers are sent to their own work before any report query runs.
  if (session && !canCreateTasks(session.employee.role)) redirect('/tasks');
  const initial = session ? await loadMisData({ employee: session.employee, client: session.client }).catch(() => null) : null;
  return <MisView initialData={withRenderTime(initial?.data || null)} />;
}
