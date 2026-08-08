'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { BotVoiceConfig } from '@alphabot/shared';

const DEFAULT_VOICE_CONFIG: BotVoiceConfig = {
  enabled:                        false,
  telephony_provider:             null,
  stt_provider:                   null,
  tts_provider:                   null,
  language:                       'en-IN',
  tts_voice:                      null,
  voicemail_enabled:              false,
  voicemail_message:              'Sorry we missed your call. Please reply on WhatsApp and we will help you.',
  greeting_message:               null,
  max_call_duration_seconds:      300,
  max_turns:                      20,
  silence_timeout_seconds:        5,
  auto_dispatch_on_escalation:    false,
  escalation_voice_delay_seconds: 0,
  trigger_on_call_request:        false,
  call_request_keywords:          ['call me', 'phone call', 'speak to someone'],
  trigger_on_negative_sentiment:  false,
  negative_sentiment_threshold:   'negative',
  trigger_on_no_reply:            false,
  no_reply_after_hours:           2,
  business_hours_only:            false,
  business_hours_start:           '09:00',
  business_hours_end:             '18:00',
  business_hours_timezone:        'Asia/Kolkata',
  business_hours_days:            [1, 2, 3, 4, 5],
  call_delay_seconds:             0,
};

export async function saveBotVoiceConfigAction(
  productSlug: string,
  patch:        Partial<BotVoiceConfig>,
): Promise<{ error?: string }> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();

  const { data: tu } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();
  if (!tu) return { error: 'Tenant not found' };

  const { data: bc } = await admin
    .from('bot_configs')
    .select('id, voice_config')
    .eq('tenant_id', tu.tenant_id)
    .eq('product_slug', productSlug)
    .single();
  if (!bc) return { error: 'Bot config not found' };

  const current = (bc.voice_config as Partial<BotVoiceConfig> | null) ?? {};
  const merged  = { ...DEFAULT_VOICE_CONFIG, ...current, ...patch };

  const { error } = await admin
    .from('bot_configs')
    .update({ voice_config: merged })
    .eq('id', bc.id);

  if (error) return { error: error.message };

  revalidatePath('/settings');
  return {};
}
