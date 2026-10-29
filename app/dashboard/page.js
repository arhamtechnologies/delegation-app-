import DashboardView from './DashboardView';
import { loadDashboardData, withRenderTime } from '../../lib/page-data';
import { getServerSession } from '../../lib/server-session';

export const metadata = { title: 'Dashboard' };

// Rendered next to the database: the first paint already contains today's work.
export default async function DashboardPage() {
  const session = await getServerSession();
  const initial = session ? await loadDashboardData({ employee: session.employee, client: session.client }).catch(() => null) : null;
  return <DashboardView initialData={withRenderTime(initial?.data || null)} />;
}
