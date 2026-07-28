'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function saveVoiceProviderAction(
  id: string,
  data: {
    credentials_json: Record<string, string>;
    config_json:      Record<string, string>;
    enabled:          boolean;
    is_default:       boolean;
  },
): Promise<{ error?: string }> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();

  // Verify caller is a platform user (manager or admin)
  const { data: platformUser } = await admin
    .from('platform_users')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!platformUser) return { error: 'Not authorised' };

  // Strip blank values so we don't overwrite existing creds with empty strings
  const creds: Record<string, string> = {};
  for (const [k, v] of Object.entries(data.credentials_json)) {
    if (v.trim()) creds[k] = v.trim();
  }

  // For credentials, merge with existing so partial updates work
  const { data: existing } = await admin
    .from('voice_provider_configs')
    .select('credentials_json, config_json')
    .eq('id', id)
    .single();

  const mergedCreds = {
    ...((existing?.credentials_json as Record<string, string>) ?? {}),
    ...creds,
  };

  const mergedConfig: Record<string, string> = {};
  for (const [k, v] of Object.entries(data.config_json)) {
    mergedConfig[k] = v;
  }

  const { error } = await admin
    .from('voice_provider_configs')
    .update({
      credentials_json: mergedCreds,
      config_json:      { ...((existing?.config_json as Record<string, unknown>) ?? {}), ...mergedConfig },
      enabled:          data.enabled,
      is_default:       data.is_default,
    })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/platform/voice-providers');
  return {};
}
