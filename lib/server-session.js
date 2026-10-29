import { cookies } from 'next/headers';
import { cache } from 'react';
import { AUTH_COOKIE, decodeJwtPayload } from './auth-cookie';
import { createSupabaseUserClient } from './supabase-server';

// One lookup per request: the caller's RLS-scoped client plus their employee profile.
// Returns null whenever the server cannot vouch for the session; pages then load in the browser as before.
export const getServerSession = cache(async () => {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const payload = decodeJwtPayload(token);
  if (!payload?.sub || !payload.exp || payload.exp * 1000 < Date.now() + 15000) return null;
  try {
    const client = createSupabaseUserClient(token);
    const { data: employee, error } = await client.from('employees').select('id,name,email,role,active,must_change_password').eq('auth_user_id', payload.sub).maybeSingle();
    if (error || !employee || employee.active === false || employee.must_change_password) return null;
    // Server and database share a region, so this second hop costs milliseconds.
    const unread = await client.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_employee_id', employee.id).is('read_at', null);
    // token stays on the server (pages pass only plain profile data to the browser).
    return { client, token, userId: payload.sub, employee, unreadCount: unread.error ? 0 : unread.count || 0 };
  } catch {
    return null;
  }
});

export async function getSidebarDefaultOpen() {
  return (await cookies()).get('sidebar_state')?.value !== 'false';
}
