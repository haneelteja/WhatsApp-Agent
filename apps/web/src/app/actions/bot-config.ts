'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { GuardrailsConfig } from '@alphabot/shared';

export interface SaveBotConfigInput {
  productSlug:          string;
  systemPrompt:         string;
  kbOnlyMode:           boolean;
  confidenceThreshold:  number;
  escalationTriggers:   string[];
  tone:                 GuardrailsConfig['tone'];
  maxResponseLength:    number;
  blockedTopics:        string[];
  blockedKeywords:      string[];
  noExternalLinks:      boolean;
  noPersonalData:       boolean;
  noPhoneNumbers:       boolean;
  onBlockedTopic:       GuardrailsConfig['on_blocked_topic'];
  customBlockedMessage: string;
}

export async function saveBotConfigAction(input: SaveBotConfigInput) {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Use admin client to bypass RLS on tenant_users lookup
  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single();

  if (!tenantUser) return { error: 'Tenant not found' };

  const guardrails_json: GuardrailsConfig = {
    blocked_topics:     input.blockedTopics,
    blocked_keywords:   input.blockedKeywords,
    max_response_length: input.maxResponseLength,
    tone:               input.tone,
    content_filters: {
      no_personal_data:               input.noPersonalData,
      no_external_links:              input.noExternalLinks,
      no_phone_numbers_in_response:   input.noPhoneNumbers,
    },
    on_blocked_topic:   input.onBlockedTopic,
    on_low_confidence:  'escalate',
    custom_blocked_message: input.customBlockedMessage || undefined,
  };

  const { error } = await admin
    .from('bot_configs')
    .update({
      system_prompt:        input.systemPrompt.trim() || null,
      kb_only_mode:         input.kbOnlyMode,
      confidence_threshold: input.confidenceThreshold,
      escalation_triggers:  input.escalationTriggers,
      guardrails_json,
      updated_by:           user.id,
    })
    .eq('tenant_id', tenantUser.tenant_id)
    .eq('product_slug', input.productSlug);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/settings');
  return { success: true };
}
