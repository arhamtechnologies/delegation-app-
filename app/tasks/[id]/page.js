import TaskDetailView from './TaskDetailView';
import { loadTaskDetail, withRenderTime } from '../../../lib/page-data';
import { getServerSession } from '../../../lib/server-session';

export const metadata = { title: 'Task' };

export default async function TaskDetailPage({ params }) {
  const { id } = await params;
  const session = await getServerSession();
  const initial = session ? await loadTaskDetail({ id, client: session.client }).catch(() => null) : null;
  return <TaskDetailView key={id} id={id} initialData={withRenderTime(initial?.data?.task ? initial.data : null)} />;
}
