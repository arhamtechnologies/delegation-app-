import FollowUpView from './FollowUpView';
import { loadFollowUpData, withRenderTime } from '../../lib/page-data';
import { getServerSession } from '../../lib/server-session';

export const metadata = { title: 'Follow-ups' };

export default async function FollowUpPage() {
  const session = await getServerSession();
  const initial = session ? await loadFollowUpData({ employee: session.employee, client: session.client }).catch(() => null) : null;
  return <FollowUpView initialData={withRenderTime(initial?.data || null)} />;
}
