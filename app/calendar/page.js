import { redirect } from 'next/navigation';
import AppShell from '../../components/AppShell';
import CalendarSettings from '../../components/CalendarSettings';
import { withRenderTime } from '../../lib/page-data';
import { getConfiguredDays } from '../../lib/server/non-working-day-rules';
import { getServerSession } from '../../lib/server-session';
import { createSupabaseAdminClient } from '../../lib/supabase-server';

export const metadata = { title: 'Calendar' };

// Holidays and leave come through the service-role client, so the caller is verified with Supabase Auth first,
// exactly like /api/checklist/non-working-days does.
async function loadCalendarData(session) {
  const { data: { user } = {}, error } = await session.client.auth.getUser(session.token);
  if (error || user?.id !== session.userId) return null;
  const [configured, employeeResponse] = await Promise.all([
    getConfiguredDays(createSupabaseAdminClient()),
    session.client.from('employees').select('id,name,email,active,role').order('name'),
  ]);
  if (employeeResponse.error) return null;
  return { employee: session.employee, employees: employeeResponse.data || [], holidays: configured.holidays || [], employeeLeave: configured.employeeLeave || [] };
}

export default async function CalendarPage() {
  const session = await getServerSession();
  if (session && !['super_admin', 'ea'].includes(session.employee.role)) redirect('/checklist');
  const initialData = session ? await loadCalendarData(session).catch(() => null) : null;
  return <AppShell title="Calendar" description="National holidays and employee non-working days used by checklist scheduling."><CalendarSettings initialData={withRenderTime(initialData)} /></AppShell>;
}
