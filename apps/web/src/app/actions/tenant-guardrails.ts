'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { LayeredGuardrailsConfig } from '@alphabot/shared';

/** Called from the client dashboard — tenantId resolved from the session. */
export async function saveTenantGuardrailsAction(guardrails: LayeredGuardrailsConfig) {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!tenantUser) return { error: 'Tenant not found' };

  const { error } = await admin
    .from('tenant_guardrails')
    .upsert({
      tenant_id:       tenantUser.tenant_id,
      guardrails_json: guardrails,
      updated_at:      new Date().toISOString(),
      updated_by:      user.id,
    });

  if (error) return { error: error.message };

  revalidatePath('/dashboard/settings');
  return { success: true };
}

/** Called from the platform console client detail page — tenantId explicit. */
export async function saveTenantGuardrailsByIdAction(
  tenantId: string,
  guardrails: LayeredGuardrailsConfig,
) {
  const admin = getSupabaseAdminClient();

  const { error } = await admin
    .from('tenant_guardrails')
    .upsert({
      tenant_id:       tenantId,
      guardrails_json: guardrails,
      updated_at:      new Date().toISOString(),
    });

  if (error) return { error: error.message };

  revalidatePath(`/platform/clients/${tenantId}`);
  return { success: true };
}
