'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export interface CallTriggersInput {
  productSlug:                  string;
  triggerOnCallRequest:         boolean;
  callRequestKeywords:          string[];
  triggerOnNegativeSentiment:   boolean;
  negativeSentimentThreshold:   'negative' | 'frustrated';
  triggerOnNoReply:             boolean;
  noReplyAfterHours:            number;
  businessHoursOnly:            boolean;
  businessHoursStart:           string;
  businessHoursEnd:             string;
  businessHoursTimezone:        string;
  businessHoursDays:            number[];
  callDelaySeconds:             number;
}

export async function saveCallTriggersAction(input: CallTriggersInput) {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single();

  if (!tenantUser) return { error: 'Tenant not found' };

  // Load existing voice_config to merge (don't overwrite telephony settings etc.)
  const { data: existing } = await admin
    .from('bot_configs')
    .select('voice_config')
    .eq('tenant_id', tenantUser.tenant_id)
    .eq('product_slug', input.productSlug)
    .single();

  const existingVoiceCfg = (existing?.voice_config ?? {}) as Record<string, unknown>;

  const merged = {
    ...existingVoiceCfg,
    trigger_on_call_request:        input.triggerOnCallRequest,
    call_request_keywords:          input.callRequestKeywords,
    trigger_on_negative_sentiment:  input.triggerOnNegativeSentiment,
    negative_sentiment_threshold:   input.negativeSentimentThreshold,
    trigger_on_no_reply:            input.triggerOnNoReply,
    no_reply_after_hours:           input.noReplyAfterHours,
    business_hours_only:            input.businessHoursOnly,
    business_hours_start:           input.businessHoursStart,
    business_hours_end:             input.businessHoursEnd,
    business_hours_timezone:        input.businessHoursTimezone,
    business_hours_days:            input.businessHoursDays,
    call_delay_seconds:             input.callDelaySeconds,
  };

  const { error } = await admin
    .from('bot_configs')
    .update({ voice_config: merged })
    .eq('tenant_id', tenantUser.tenant_id)
    .eq('product_slug', input.productSlug);

  if (error) return { error: error.message };

  revalidatePath('/call-triggers');
  return { success: true };
}
