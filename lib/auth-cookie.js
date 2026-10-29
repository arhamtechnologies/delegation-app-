// The browser keeps the Supabase session; this cookie mirrors its access token so
// server components can query as the same user (RLS still decides what they see).
export const AUTH_COOKIE = 'dl_access_token';

export function decodeJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const json = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function writeAuthCookie(session) {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  if (!session?.access_token) {
    document.cookie = `${AUTH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    return;
  }
  const maxAge = Math.max(0, Number(session.expires_at || 0) - Math.floor(Date.now() / 1000));
  document.cookie = `${AUTH_COOKIE}=${session.access_token}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}
