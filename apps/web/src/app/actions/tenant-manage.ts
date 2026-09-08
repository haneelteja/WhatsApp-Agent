'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

async function getActor(): Promise<{ actorId: string | null; actorEmail: string | null }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return { actorId: user?.id ?? null, actorEmail: user?.email ?? null };
  } catch {
    return { actorId: null, actorEmail: null };
  }
}

export async function setTenantStatusAction(
  tenantId: string,
  status: 'active' | 'suspended',
): Promise<{ error?: string }> {
  const admin = getSupabaseAdminClient();

  const { data: tenant } = await admin.from('tenants').select('name, status').eq('id', tenantId).single();
  const { error } = await admin.from('tenants').update({ status }).eq('id', tenantId);
  if (error) return { error: error.message };

  const { actorId, actorEmail } = await getActor();
  const action = status === 'suspended' ? 'tenant.suspended' : 'tenant.activated';
  const label  = status === 'suspended' ? 'Suspended' : 'Reactivated';
  void writeAuditLog({
    tenantId,
    actorId,
    actorEmail,
    action,
    entityType: 'tenant',
    entityId:   tenantId,
    description: `${label} client "${tenant?.name ?? tenantId}" (was: ${tenant?.status ?? 'unknown'})`,
    metadata: { previous_status: tenant?.status, new_status: status },
  });

  revalidatePath(`/platform/clients/${tenantId}`);
  revalidatePath('/platform/clients');
  return {};
}

export async function clearTenantChatsAction(tenantId: string): Promise<{ error?: string; deleted?: number }> {
  const admin = getSupabaseAdminClient();

  const { data: tenant } = await admin.from('tenants').select('name').eq('id', tenantId).single();

  // Fetch conversation IDs first so we can delete their messages explicitly
  // (no confirmed ON DELETE CASCADE from conversations→messages in migrations)
  const { data: convs } = await admin
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId);

  const convIds = (convs ?? []).map(c => c.id as string);

  if (convIds.length > 0) {
    const { error: msgErr } = await admin
      .from('messages')
      .delete()
      .in('conversation_id', convIds);
    if (msgErr) return { error: msgErr.message };
  }

  const { count, error: convErr } = await admin
    .from('conversations')
    .delete({ count: 'exact' })
    .eq('tenant_id', tenantId);
  if (convErr) return { error: convErr.message };

  const { actorId, actorEmail } = await getActor();
  void writeAuditLog({
    tenantId,
    actorId,
    actorEmail,
    action: 'tenant.chats_cleared',
    entityType: 'tenant',
    entityId: tenantId,
    description: `Cleared all conversations for "${tenant?.name ?? tenantId}" (${count ?? 0} conversations deleted)`,
    metadata: { conversations_deleted: count ?? 0 },
  });

  revalidatePath(`/platform/clients/${tenantId}`);
  return { deleted: count ?? 0 };
}

export async function resetTenantSubscriptionsAction(tenantId: string): Promise<{ error?: string }> {
  const admin = getSupabaseAdminClient();

  const { data: tenant } = await admin.from('tenants').select('name, subscription_status, plan').eq('id', tenantId).single();

  const [{ error: subErr }, { error: tenantErr }] = await Promise.all([
    admin.from('subscriptions').delete().eq('tenant_id', tenantId),
    admin.from('tenants')
      .update({ subscription_status: null, razorpay_subscription_id: null })
      .eq('id', tenantId),
  ]);

  if (subErr)    return { error: subErr.message };
  if (tenantErr) return { error: tenantErr.message };

  const { actorId, actorEmail } = await getActor();
  void writeAuditLog({
    tenantId,
    actorId,
    actorEmail,
    action: 'tenant.subscriptions_reset',
    entityType: 'tenant',
    entityId: tenantId,
    description: `Reset subscriptions for "${tenant?.name ?? tenantId}" (was: ${tenant?.subscription_status ?? 'none'}, plan: ${tenant?.plan})`,
    metadata: { previous_subscription_status: tenant?.subscription_status, plan: tenant?.plan },
  });

  revalidatePath(`/platform/clients/${tenantId}`);
  revalidatePath('/platform/clients');
  return {};
}

export async function deleteTenantAction(tenantId: string): Promise<{ error?: string }> {
  const admin = getSupabaseAdminClient();

  const { data: tenant } = await admin.from('tenants').select('name').eq('id', tenantId).single();

  // Fetch auth user IDs before deleting (cascade will remove tenant_users rows)
  const { data: users } = await admin
    .from('tenant_users')
    .select('user_id')
    .eq('tenant_id', tenantId);

  const { actorId, actorEmail } = await getActor();

  // Write audit log before delete so tenant_id FK still resolves
  void writeAuditLog({
    tenantId: null,
    actorId,
    actorEmail,
    action: 'tenant.deleted',
    entityType: 'tenant',
    entityId: tenantId,
    description: `Permanently deleted client "${tenant?.name ?? tenantId}"`,
    metadata: { tenant_id: tenantId, tenant_name: tenant?.name },
  });

  const { error } = await admin.from('tenants').delete().eq('id', tenantId);
  if (error) return { error: error.message };

  // Best-effort: remove auth accounts for all users on this tenant
  for (const u of (users ?? [])) {
    await admin.auth.admin.deleteUser(u.user_id).catch(() => null);
  }

  revalidatePath('/platform/clients');
  redirect('/platform/clients');
}
