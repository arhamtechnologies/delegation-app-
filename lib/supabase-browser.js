'use client';
import { createClient } from '@supabase/supabase-js';
let client;
export function supabaseBrowser(){
  if(!client) client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  return client;
}
