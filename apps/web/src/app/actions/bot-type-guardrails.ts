'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { LayeredGuardrailsConfig } from '@alphabot/shared';

export async function saveBotTypeGuardrailsAction(
  productSlug: string,
  guardrails: LayeredGuardrailsConfig,
) {
  const admin = getSupabaseAdminClient();

  const { error } = await admin
    .from('bot_type_guardrails')
    .upsert({
      product_slug:    productSlug,
      guardrails_json: guardrails,
      updated_at:      new Date().toISOString(),
    });

  if (error) return { error: error.message };

  revalidatePath('/platform/bot-guardrails');
  return { success: true };
}
