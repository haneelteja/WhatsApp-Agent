'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function invitePlatformUserAction(email: string, role: 'manager' | 'admin') {
  const admin = getSupabaseAdminClient();

  // Check if already a platform user
  const { data: { users } } = await admin.auth.admin.listUsers();
  const existing = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    const { data: existingRow } = await admin
      .from('platform_users')
      .select('id')
      .eq('user_id', existing.id)
      .single();
    if (existingRow) return { error: 'This email is already a platform team member.' };
  }

  // Send Supabase magic-link invite
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error) return { error: error.message };

  const { error: insertError } = await admin.from('platform_users').insert({
    user_id: data.user.id,
    role,
    name: email.split('@')[0],
  });
  if (insertError) return { error: insertError.message };

  revalidatePath('/platform/users');
  return { ok: true };
}

export async function updatePlatformUserRoleAction(userId: string, role: 'manager' | 'admin') {
  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('platform_users')
    .update({ role })
    .eq('user_id', userId);
  if (error) return { error: error.message };
  revalidatePath('/platform/users');
  return { ok: true };
}

export async function removePlatformUserAction(userId: string) {
  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('platform_users')
    .delete()
    .eq('user_id', userId);
  if (error) return { error: error.message };
  revalidatePath('/platform/users');
  return { ok: true };
}
