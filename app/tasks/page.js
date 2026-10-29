import TasksView from './TasksView';
import { loadTasksData, parseTaskFilters, withRenderTime } from '../../lib/page-data';
import { getServerSession } from '../../lib/server-session';

export const metadata = { title: 'Tasks' };

export default async function TasksPage({ searchParams }) {
  const session = await getServerSession();
  const filters = parseTaskFilters(await searchParams);
  const initial = session ? await loadTasksData({ employee: session.employee, client: session.client, filters }).catch(() => null) : null;
  // Keyed by filters so a same-route navigation (e.g. ?create=1 or a sidebar click) starts from the URL's filters.
  return <TasksView key={JSON.stringify(filters)} initialData={withRenderTime(initial?.data || null)} />;
}
