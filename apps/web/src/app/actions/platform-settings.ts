'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { PlatformGuardrails } from '@alphabot/shared';

export async function savePlatformGuardrailsAction(guardrails: PlatformGuardrails) {
  const supabase = await getSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Verify platform manager role
  const { data: platformUser } = await supabase
    .from('platform_users')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (platformUser?.role !== 'manager') return { error: 'Insufficient permissions' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('platform_settings')
    .upsert({
      key:        'guardrails',
      value:      guardrails,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    });

  if (error) return { error: error.message };

  revalidatePath('/platform/settings');
  return { success: true };
}
