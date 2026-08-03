export const dynamic = 'force-dynamic';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export default async function CampaignsPage() {
  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.from('campaigns').select('id').limit(1);
    return (
      <div style={{ padding: 40 }}>
        <p>Admin query OK ✓</p>
        <p>Rows: {JSON.stringify(data)}</p>
        <p>Error: {JSON.stringify(error)}</p>
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
