import { createHash } from 'node:crypto';

export function notificationFingerprint(parts) {
  return createHash('sha256').update(parts.map((part) => String(part ?? '')).join('|')).digest('hex');
}

export async function createServerNotifications(admin, records) {
  const rows = (records || []).filter((record) => record?.recipient_employee_id && record?.kind && record?.title && record?.dedupe_key);
  if (!rows.length) return { error: null };
  try {
    const { error } = await admin.from('notifications').upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true });
    if (error) {
      console.error('Notification delivery failed.', { code: error.code, message: error.message });
    }
    return { error: error || null };
  } catch (error) {
    console.error('Notification delivery failed.', { message: error.message });
    return { error };
  }
}
