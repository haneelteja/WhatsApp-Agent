'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function setTenantStatusAction(
  tenantId: string,
  status: 'active' | 'suspended',
): Promise<{ error?: string }> {
  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('tenants')
    .update({ status })
    .eq('id', tenantId);
  if (error) return { error: error.message };
  revalidatePath(`/platform/clients/${tenantId}`);
  revalidatePath('/platform/clients');
  return {};
}

export async function deleteTenantAction(tenantId: string): Promise<{ error?: string }> {
  const admin = getSupabaseAdminClient();

  // Fetch auth user IDs before deleting (cascade will remove tenant_users rows)
  const { data: users } = await admin
    .from('tenant_users')
    .select('user_id')
    .eq('tenant_id', tenantId);

  const { error } = await admin
    .from('tenants')
    .delete()
    .eq('id', tenantId);

  if (error) return { error: error.message };

  // Best-effort: remove auth accounts for all users on this tenant
  for (const u of (users ?? [])) {
    await admin.auth.admin.deleteUser(u.user_id).catch(() => null);
  }

  revalidatePath('/platform/clients');
  redirect('/platform/clients');
}
