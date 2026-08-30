'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient }  from '@/lib/supabase/admin';
import { revalidatePath }          from 'next/cache';

export async function saveCallSummarySettings(
  enabled:   boolean,
  waNumbers: string[],
): Promise<{ error?: string }> {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!tenantUser) return { error: 'Tenant not found' };

  // Strip blanks and normalise
  const cleaned = waNumbers.map(n => n.trim()).filter(Boolean);

  const { error } = await admin
    .from('tenant_voice_configs')
    .upsert(
      {
        tenant_id:                tenantUser.tenant_id,
        call_summary_enabled:     enabled,
        call_summary_wa_numbers:  cleaned,
      },
      { onConflict: 'tenant_id' },
    );

  if (error) return { error: error.message };

  revalidatePath('/settings');
  return {};
}
