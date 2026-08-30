'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient }  from '@/lib/supabase/admin';
import { revalidatePath }          from 'next/cache';

async function getTenantId(): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: tu } = await admin.from('tenant_users').select('tenant_id').eq('user_id', user.id).single();
  return tu?.tenant_id ?? null;
}

export async function createBroadcast(
  name:         string,
  message:      string,
  audienceType: 'all' | 'recent_7d' | 'recent_10d' | 'groups',
  groupIds:     string[],
  scheduledAt:  string | null,  // ISO string or null = send now
): Promise<{ id?: string; error?: string }> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: 'Unauthorized' };

  const admin  = getSupabaseAdminClient();
  const status = scheduledAt ? 'scheduled' : 'draft';

  const { data, error } = await admin
    .from('broadcast_messages')
    .insert({
      tenant_id:     tenantId,
      name:          name.trim(),
      message:       message.trim(),
      audience_type: audienceType,
      group_ids:     groupIds,
      scheduled_at:  scheduledAt,
      status,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

  const broadcastId = (data as { id: string }).id;

  // If immediate, fire via API
  if (!scheduledAt) {
    const apiBase = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://whatsapp-agent-fmtg.onrender.com';
    // Fire and forget — don't block the response
    fetch(`${apiBase}/api/broadcast/${broadcastId}/send`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${(await (await getSupabaseServerClient()).auth.getSession()).data.session?.access_token ?? ''}` },
    }).catch(() => void 0);
  }

  revalidatePath('/conversations');
  return { id: broadcastId };
}

export async function cancelBroadcast(broadcastId: string): Promise<{ error?: string }> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('broadcast_messages')
    .update({ status: 'cancelled' })
    .eq('id', broadcastId)
    .eq('tenant_id', tenantId)
    .in('status', ['draft', 'scheduled']);

  if (error) return { error: error.message };
  revalidatePath('/conversations');
  return {};
}

export type BroadcastRow = {
  id: string; name: string; message: string; audience_type: string;
  group_ids: string[]; scheduled_at: string | null; status: string;
  total_count: number; sent_count: number; failed_count: number; created_at: string;
};

export async function listBroadcasts(): Promise<{ broadcasts: BroadcastRow[]; error?: string }> {
  const tenantId = await getTenantId();
  if (!tenantId) return { broadcasts: [], error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('broadcast_messages')
    .select('id, name, message, audience_type, group_ids, scheduled_at, status, total_count, sent_count, failed_count, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return { broadcasts: [], error: error.message };
  return { broadcasts: (data ?? []) as BroadcastRow[] };
}
