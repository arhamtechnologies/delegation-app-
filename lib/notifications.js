import { supabaseBrowser } from './supabase-browser';

const unreadCountCache = new Map();
const unreadCountRequests = new Map();
const unreadCountCacheTtl = 2000;

export async function getUnreadNotificationCount(employeeId, { force = false } = {}) {
  if (!employeeId) return { count: 0, error: null };
  if (unreadCountRequests.has(employeeId)) return unreadCountRequests.get(employeeId);
  const cached = unreadCountCache.get(employeeId);
  if (!force && cached && Date.now() - cached.timestamp < unreadCountCacheTtl) return cached.response;
  let query = supabaseBrowser()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_employee_id', employeeId)
    .is('read_at', null);
  const request = query.then((response) => {
    unreadCountCache.set(employeeId, { timestamp: Date.now(), response });
    return response;
  }).finally(() => unreadCountRequests.delete(employeeId));
  unreadCountRequests.set(employeeId, request);
  return request;
}

export function clearUnreadNotificationCountCache(employeeId) {
  if (employeeId) unreadCountCache.delete(employeeId);
  else unreadCountCache.clear();
}

export async function markNotificationRead(id, employeeId) {
  let query = supabaseBrowser()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);
  if (employeeId) query = query.eq('recipient_employee_id', employeeId);
  return query;
}

export async function markNotificationsRead(ids, employeeId) {
  if (!ids.length) return { data: [], error: null };
  let query = supabaseBrowser()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .in('id', ids)
    .is('read_at', null);
  if (employeeId) query = query.eq('recipient_employee_id', employeeId);
  return query;
}

export async function markAllNotificationsRead(employeeId) {
  if (!employeeId) return { data: [], error: null };
  return supabaseBrowser()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_employee_id', employeeId)
    .is('read_at', null);
}

export function signalNotificationsChanged() {
  clearUnreadNotificationCountCache();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('notifications:changed'));
}
