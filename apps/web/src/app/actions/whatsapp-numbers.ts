'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export type WaProvider = 'meta_cloud' | 'interakt' | 'wati' | 'gupshup';

export interface WhatsAppNumberData {
  phone_number: string;
  provider:     WaProvider;
  label:        string;
  config_json:  Record<string, string>;
}

export async function upsertWhatsAppNumberAction(
  tenantId:    string,
  productSlug: string,
  data:        WhatsAppNumberData,
): Promise<{ ok: true } | { error: string }> {
  const admin = getSupabaseAdminClient();

  const { data: existing } = await admin
    .from('whatsapp_numbers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('product_slug', productSlug)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from('whatsapp_numbers')
      .update({ ...data, active: true })
      .eq('id', existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await admin
      .from('whatsapp_numbers')
      .insert({ tenant_id: tenantId, product_slug: productSlug, active: true, ...data });
    if (error) return { error: error.message };
  }

  revalidatePath(`/platform/clients/${tenantId}`);
  return { ok: true };
}
