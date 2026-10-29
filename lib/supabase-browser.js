import { createClient } from '@supabase/supabase-js';
import { writeAuthCookie } from './auth-cookie';
import { markMutation } from './query-cache';

// Writes (anything but GET/HEAD, except read-only RPCs) mark cached server renders as outdated.
function trackingFetch(input, init) {
  const method = (init?.method || 'GET').toUpperCase();
  const url = typeof input === 'string' ? input : input?.url || '';
  if (method !== 'GET' && method !== 'HEAD' && !/\/rpc\/get_/.test(url)) markMutation();
  return fetch(input, init);
}
let client;
let recoveryClient;

export function supabaseBrowser(){
  // Server code must pass its own request-scoped client; a shared anon client would silently return no rows under RLS.
  if (typeof window === 'undefined') throw new Error('supabaseBrowser() is browser-only; pass the server session client instead.');
  if(!client) {
    client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: { fetch: trackingFetch },
    });
    // INITIAL_SESSION, sign-in, refresh and sign-out all keep the server-render cookie in step.
    if (typeof window !== 'undefined') client.auth.onAuthStateChange((event, session) => writeAuthCookie(session));
  }
  return client;
}

export function supabaseRecoveryBrowser(){
  if(!recoveryClient) recoveryClient=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
  return recoveryClient;
}
