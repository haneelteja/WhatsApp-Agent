import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Service-role client — bypasses RLS. Server-side only. Never expose to the browser.
// Singleton: avoids allocating a new SupabaseClient on every Server Component invocation.
let _adminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (_adminClient) return _adminClient;
  _adminClient = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return _adminClient;
}
