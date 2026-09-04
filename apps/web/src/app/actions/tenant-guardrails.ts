'use server';

import { revalidatePath }         from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';
import { writeAuditLog }          from '@/lib/audit';
import type { LayeredGuardrailsConfig } from '@alphabot/shared';

export async function saveTenantGuardrailsAction(guardrails: LayeredGuardrailsConfig) {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('tenant_guardrails')
    .upsert({
      tenant_id:       session.tenantId,
      guardrails_json: guardrails,
      updated_at:      new Date().toISOString(),
      updated_by:      session.userId,
    });

  if (error) return { error: error.message };

  void writeAuditLog({
    tenantId:    session.tenantId,
    actorId:     session.userId,
    actorEmail:  session.userEmail,
    action:      'guardrails.updated',
    entityType:  'tenant_guardrails',
    description: 'Updated workspace-wide guardrails',
  });

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
