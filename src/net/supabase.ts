import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

let client: SupabaseClient | null = null;

/** The signed-in client (guest or Discord): the session is kept in this browser and refreshed. */
export function authClient(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: '4mules.auth' },
  });
  return client;
}
