'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { revalidatePath }         from 'next/cache';
import { getSession }             from '@/lib/session';

export async function saveCallSummarySettings(
  enabled:   boolean,
  waNumbers: string[],
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const cleaned = waNumbers.map(n => n.trim()).filter(Boolean);

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('tenant_voice_configs')
    .upsert(
      {
        tenant_id:                session.tenantId,
        call_summary_enabled:     enabled,
        call_summary_wa_numbers:  cleaned,
      },
      { onConflict: 'tenant_id' },
    );

  if (error) return { error: error.message };

  revalidatePath('/settings');
  return {};
}
