'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function saveProductDefaultsAction(
  slug: string,
  defaultPrompt: string,
  defaultModel: string,
) {
  const admin = getSupabaseAdminClient();

  const { error } = await admin
    .from('products')
    .update({
      default_prompt: defaultPrompt.trim(),
      default_model:  defaultModel.trim(),
    })
    .eq('slug', slug);

  if (error) return { error: error.message };

  revalidatePath('/platform/products');
  return { success: true };
}

export async function toggleClientProductAction(
  tenantId: string,
  productSlug: string,
  active: boolean,
) {
  const admin = getSupabaseAdminClient();

  if (active) {
    // Enable: upsert tenant_product row
    await admin.from('tenant_products').upsert({
      tenant_id:    tenantId,
      product_type: productSlug,
      tier:         'base',
      active:       true,
    }, { onConflict: 'tenant_id,product_type' });

    // Ensure a bot_config row exists (ignore if already there)
    const { data: existing } = await admin
      .from('bot_configs')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('product_slug', productSlug)
      .maybeSingle();

    if (!existing) {
      await admin.from('bot_configs').insert({
        tenant_id:            tenantId,
        product_slug:         productSlug,
        system_prompt:        null,
        ai_model:             null,
        confidence_threshold: 0.6,
        kb_only_mode:         false,
        escalation_triggers: [
          'speak to human', 'talk to agent', 'human please', 'escalate',
          'complaint', 'refund', 'dispute', 'urgent',
        ],
        guardrails_json: {
          blocked_topics: [], blocked_keywords: [], max_response_length: 1000,
          tone: 'professional',
          content_filters: { no_personal_data: false, no_external_links: false, no_phone_numbers_in_response: false },
          on_blocked_topic: 'escalate', on_low_confidence: 'escalate',
        },
      });
    }
  } else {
    // Disable: set active=false (preserves config)
    await admin
      .from('tenant_products')
      .update({ active: false })
      .eq('tenant_id', tenantId)
      .eq('product_type', productSlug);
  }

  revalidatePath(`/platform/clients/${tenantId}`);
  return { success: true };
}
