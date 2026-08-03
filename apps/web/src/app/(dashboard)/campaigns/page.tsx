export const dynamic = 'force-dynamic';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export default async function CampaignsPage() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const admin = getSupabaseAdminClient();
    const { data: tenantUser } = await admin
      .from('tenant_users').select('tenant_id').eq('user_id', user.id).single();
    const tenantId = tenantUser?.tenant_id ?? '';

    const [
      { data: campaigns, count: totalCampaigns, error: campError },
      { count: runningCount },
      { count: completedCount },
    ] = await Promise.all([
      admin.from('campaigns').select('*', { count: 'exact' }).eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(50),
      admin.from('campaigns').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'running'),
      admin.from('campaigns').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'completed'),
    ]);

    return (
      <div style={{ padding: 40 }}>
        <p>Queries OK ✓</p>
        <p>Total: {totalCampaigns ?? 0}</p>
        <p>Running: {runningCount ?? 0}</p>
        <p>Completed: {completedCount ?? 0}</p>
        <p>DB error: {JSON.stringify(campError)}</p>
        <p>Rows: {JSON.stringify(campaigns?.slice(0, 2))}</p>
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
