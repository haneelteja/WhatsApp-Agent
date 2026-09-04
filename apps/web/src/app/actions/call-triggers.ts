'use server';

import { revalidatePath }         from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';
import { writeAuditLog }          from '@/lib/audit';

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
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();

  const { data: existing } = await admin
    .from('bot_configs')
    .select('voice_config')
    .eq('tenant_id', session.tenantId)
    .eq('product_slug', input.productSlug)
    .single();

  const existingVoiceCfg = (existing?.voice_config ?? {}) as Record<string, unknown>;

  const merged = {
    ...existingVoiceCfg,
    trigger_on_call_request:       input.triggerOnCallRequest,
    call_request_keywords:         input.callRequestKeywords,
    trigger_on_negative_sentiment: input.triggerOnNegativeSentiment,
    negative_sentiment_threshold:  input.negativeSentimentThreshold,
    trigger_on_no_reply:           input.triggerOnNoReply,
    no_reply_after_hours:          input.noReplyAfterHours,
    business_hours_only:           input.businessHoursOnly,
    business_hours_start:          input.businessHoursStart,
    business_hours_end:            input.businessHoursEnd,
    business_hours_timezone:       input.businessHoursTimezone,
    business_hours_days:           input.businessHoursDays,
    call_delay_seconds:            input.callDelaySeconds,
  };

  const { error } = await admin
    .from('bot_configs')
    .update({ voice_config: merged })
    .eq('tenant_id', session.tenantId)
    .eq('product_slug', input.productSlug);

  if (error) return { error: error.message };

  void writeAuditLog({
    tenantId:    session.tenantId,
    actorId:     session.userId,
    actorEmail:  session.userEmail,
    action:      'call_triggers.updated',
    entityType:  'bot_config',
    entityId:    input.productSlug,
    description: `Updated call triggers for ${input.productSlug.replace(/_/g, ' ')}`,
    metadata: { productSlug: input.productSlug, triggerOnCallRequest: input.triggerOnCallRequest, triggerOnNegativeSentiment: input.triggerOnNegativeSentiment },
  });

  revalidatePath('/call-triggers');
  return { success: true };
}
