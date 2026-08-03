export const dynamic = 'force-dynamic';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export default async function CampaignsPage() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    const admin = getSupabaseAdminClient();
    const { data: tenantUser } = await admin
      .from('tenant_users').select('tenant_id').eq('user_id', user?.id ?? '').single();

    return (
      <div style={{ padding: 40 }}>
        <p>Auth OK ✓</p>
        <p>User: {user?.email ?? 'null'}</p>
        <p>Auth error: {JSON.stringify(authError)}</p>
        <p>Tenant ID: {tenantUser?.tenant_id ?? 'null'}</p>
      </div>
    );
  } catch (err) {
    return (
      <div style={{ padding: 40, color: 'red' }}>
        <p>Caught error:</p>
        <pre>{err instanceof Error ? `${err.message}\n${err.stack}` : String(err)}</pre>
      </div>
    );
  }
}
