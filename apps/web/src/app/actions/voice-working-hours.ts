'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { revalidatePath }         from 'next/cache';
import { getSession }             from '@/lib/session';

type DayKey      = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type DaySchedule = { start: string; end: string; enabled: boolean };

export async function saveVoiceWorkingHours(
  timezone:     string,
  enabled:      boolean,
  workingHours: Record<DayKey, DaySchedule>,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('tenant_voice_configs')
    .upsert(
      {
        tenant_id:             session.tenantId,
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
