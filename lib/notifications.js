import { supabaseBrowser } from './supabase-browser';

export async function getUnreadNotificationCount() {
  return supabaseBrowser()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
}

export async function markNotificationRead(id) {
  return supabaseBrowser()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);
}

export async function markNotificationsRead(ids) {
  if (!ids.length) return { data: [], error: null };
  return supabaseBrowser()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .in('id', ids)
    .is('read_at', null);
}

export function signalNotificationsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('notifications:changed'));
}
