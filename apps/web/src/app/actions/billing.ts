'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export type TenantPlan   = 'starter' | 'growth' | 'scale';
export type TenantStatus = 'active' | 'trial' | 'suspended';

export async function updateTenantPlanAction(
  tenantId: string,
  plan: TenantPlan,
): Promise<{ ok: true } | { error: string }> {
  const admin = getSupabaseAdminClient();
  const { error } = await admin.from('tenants').update({ plan }).eq('id', tenantId);
  if (error) return { error: error.message };
  revalidatePath(`/platform/clients/${tenantId}`);
  revalidatePath('/platform/billing');
  return { ok: true };
}

export async function updateTenantStatusAction(
  tenantId: string,
  status: TenantStatus,
): Promise<{ ok: true } | { error: string }> {
  const admin = getSupabaseAdminClient();
  const { error } = await admin.from('tenants').update({ status }).eq('id', tenantId);
  if (error) return { error: error.message };
  revalidatePath(`/platform/clients/${tenantId}`);
  revalidatePath('/platform/billing');
  return { ok: true };
}

export async function upsertSubscriptionAction(
  tenantId:    string,
  productType: string,
  data: { tier: string; billing_cycle: string; next_billing_date: string },
): Promise<{ ok: true } | { error: string }> {
  const admin = getSupabaseAdminClient();
  const { error } = await admin.from('subscriptions').upsert(
    { tenant_id: tenantId, product_type: productType, ...data },
    { onConflict: 'tenant_id,product_type' },
  );
  if (error) return { error: error.message };
  revalidatePath(`/platform/clients/${tenantId}`);
  return { ok: true };
}

export async function grantFreeTrialAction(
  tenantId:    string,
  productSlug: string,
  data: { ends_at: string; allowed_model: string },
): Promise<{ ok: true } | { error: string }> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = getSupabaseAdminClient();
  const { error } = await admin.from('free_trials').upsert(
    { tenant_id: tenantId, product_slug: productSlug, status: 'active', created_by: user?.id, ...data },
    { onConflict: 'tenant_id,product_slug' },
  );
  if (error) return { error: error.message };
  revalidatePath(`/platform/clients/${tenantId}`);
  revalidatePath('/platform/billing');
  return { ok: true };
}

export async function revokeTrialAction(
  tenantId:    string,
  productSlug: string,
): Promise<{ ok: true } | { error: string }> {
  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('free_trials')
    .update({ status: 'expired' })
    .eq('tenant_id', tenantId)
    .eq('product_slug', productSlug)
    .eq('status', 'active');
  if (error) return { error: error.message };
  revalidatePath(`/platform/clients/${tenantId}`);
  revalidatePath('/platform/billing');
  return { ok: true };
}
