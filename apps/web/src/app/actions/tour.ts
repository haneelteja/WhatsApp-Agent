'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient }  from '@/lib/supabase/admin';

export async function markTourCompleteAction() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const admin = getSupabaseAdminClient();
    const { data: tu } = await admin
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    if (!tu) return;

    await admin
      .from('tenant_users')
      .update({ tour_completed_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('tenant_id', tu.tenant_id);
  } catch {
    // Fail silently — tour state is tracked client-side too
  }
}
