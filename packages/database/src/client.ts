import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _serverClient: SupabaseClient | null = null;

/**
 * Server-side Supabase client (service role — bypasses RLS).
 * Use only in backend/API code, never in the browser.
 */
export function getServerClient(): SupabaseClient {
  if (_serverClient) return _serverClient;

  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  _serverClient = createClient(url, key, {
    auth: { persistSession: false },
  });
  return _serverClient;
}

/**
 * Create a per-request Supabase client scoped to a specific tenant's JWT.
 * Used in Fastify route handlers after auth verification.
 */
export function getTenantClient(accessToken: string): SupabaseClient {
  const url = process.env['SUPABASE_URL'];
  const anonKey = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !anonKey) {
    throw new Error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }

  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
}
