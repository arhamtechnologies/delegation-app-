import ChecklistDetailView from './ChecklistDetailView';
import { loadChecklistDetail, withRenderTime } from '../../../../lib/page-data';
import { getServerSession } from '../../../../lib/server-session';

export const metadata = { title: 'Checklist item' };

export default async function ChecklistDetailPage({ params }) {
  const { id } = await params;
  const session = await getServerSession();
  const initial = session ? await loadChecklistDetail({ id, client: session.client }).catch(() => null) : null;
  return <ChecklistDetailView key={id} id={id} initialData={withRenderTime(initial?.data?.item ? initial.data : null)} initialEmployee={session?.employee || null} />;
}
