'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

type Recipient = { role?: string; email?: string };

export async function toggleNotificationAction(id: string, enabled: boolean) {
  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('notification_configs')
    .update({ enabled })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/platform/notifications');
  return { ok: true };
}

export async function updateNotificationRecipientsAction(id: string, recipients: Recipient[]) {
  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('notification_configs')
    .update({ recipients })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/platform/notifications');
  return { ok: true };
}
