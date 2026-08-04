'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export interface TenantVoiceConfigInput {
  from_number:            string;
  max_calls_per_month:    number | null;
  max_minutes_per_month:  number | null;
  max_calls_per_day:      number | null;
  max_cost_inr_per_month: number | null;
}

export async function saveTenantVoiceConfigAction(
  tenantId: string,
  input:    TenantVoiceConfigInput,
): Promise<{ error?: string }> {
  const admin = getSupabaseAdminClient();

  const { error } = await admin
    .from('tenant_voice_configs')
    .upsert(
      {
        tenant_id:              tenantId,
        from_number:            input.from_number.trim(),
        max_calls_per_month:    input.max_calls_per_month,
        max_minutes_per_month:  input.max_minutes_per_month,
        max_calls_per_day:      input.max_calls_per_day,
        max_cost_inr_per_month: input.max_cost_inr_per_month,
      },
      { onConflict: 'tenant_id' },
    );

  if (error) return { error: error.message };

  revalidatePath(`/platform/clients/${tenantId}`);
  return {};
}

export async function resetVoiceUsageAction(tenantId: string): Promise<{ error?: string }> {
  const admin = getSupabaseAdminClient();

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartStr = monthStart.toISOString().slice(0, 10);

  const { error } = await admin
    .from('tenant_voice_configs')
    .update({
      calls_this_month:    0,
      minutes_this_month:  0,
      cost_inr_this_month: 0,
      calls_today:         0,
      monthly_reset_at:    monthStartStr,
      daily_reset_at:      today,
    })
    .eq('tenant_id', tenantId);

  if (error) return { error: error.message };

  revalidatePath(`/platform/clients/${tenantId}`);
  return {};
}
