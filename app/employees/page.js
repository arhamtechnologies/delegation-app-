import EmployeesView from './EmployeesView';
import { loadEmployeesData, withRenderTime } from '../../lib/page-data';
import { redirect } from 'next/navigation';
import { canCreateTasks } from '../../lib/auth';
import { getServerSession } from '../../lib/server-session';

export const metadata = { title: 'People' };

export default async function EmployeesPage() {
  const session = await getServerSession();
  // Managers only; doers are sent to their own work before any report query runs.
  if (session && !canCreateTasks(session.employee.role)) redirect('/tasks');
  const initial = session ? await loadEmployeesData({ employee: session.employee, client: session.client }).catch(() => null) : null;
  return <EmployeesView initialData={withRenderTime(initial?.data || null)} />;
}
