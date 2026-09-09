'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';

export interface NotificationItem {
  id:              string;
  type:            string;
  title:           string;
  body:            string | null;
  conversation_id: string | null;
  contact_name:    string | null;
  contact_phone:   string | null;
  read_at:         string | null;
  created_at:      string;
}

export async function getNotificationsInboxAction(): Promise<NotificationItem[]> {
  const session = await getSession();
  if (!session) return [];

  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('notifications' as never)
    .select('*')
    .eq('tenant_id', session.tenantId)
    .order('created_at', { ascending: false })
    .limit(30);

  return (data ?? []) as NotificationItem[];
}

export async function markNotificationsReadAction(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const session = await getSession();
  if (!session) return;

  const admin = getSupabaseAdminClient();
  await admin
    .from('notifications' as never)
    .update({ read_at: new Date().toISOString() } as never)
    .in('id', ids)
    .eq('tenant_id', session.tenantId);
}
