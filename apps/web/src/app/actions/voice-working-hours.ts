'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient }  from '@/lib/supabase/admin';
import { revalidatePath }          from 'next/cache';

type DayKey      = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type DaySchedule = { start: string; end: string; enabled: boolean };

export async function saveVoiceWorkingHours(
  timezone:     string,
  enabled:      boolean,
  workingHours: Record<DayKey, DaySchedule>,
): Promise<{ error?: string }> {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!tenantUser) return { error: 'Tenant not found' };

  const { error } = await admin
    .from('tenant_voice_configs')
    .upsert(
      {
        tenant_id:             tenantUser.tenant_id,
        timezone,
        working_hours_enabled: enabled,
        working_hours_json:    workingHours,
      },
      { onConflict: 'tenant_id' },
    );

  if (error) return { error: error.message };

  revalidatePath('/settings');
  return {};
}
