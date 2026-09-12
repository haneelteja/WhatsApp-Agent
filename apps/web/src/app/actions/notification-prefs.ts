'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';
import { revalidatePath }         from 'next/cache';

export type UserNotificationPrefs = {
  escalation_email: boolean;
  assignment_email: boolean;
};

export async function getNotificationPrefsAction(): Promise<UserNotificationPrefs | null> {
  const session = await getSession();
  if (!session) return null;

  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('user_notification_preferences')
    .select('escalation_email, assignment_email')
    .eq('user_id',   session.userId)
    .eq('tenant_id', session.tenantId)
    .single();

  if (!data) return { escalation_email: true, assignment_email: true };
  return { escalation_email: data.escalation_email, assignment_email: data.assignment_email };
}

export async function saveNotificationPrefsAction(
  prefs: UserNotificationPrefs
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('user_notification_preferences')
    .upsert({
      user_id:          session.userId,
      tenant_id:        session.tenantId,
      escalation_email: prefs.escalation_email,
      assignment_email: prefs.assignment_email,
    }, { onConflict: 'user_id,tenant_id' });

  if (error) return { error: error.message };
  revalidatePath('/settings');
  return {};
}
