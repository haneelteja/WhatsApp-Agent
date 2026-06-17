'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export type WaProvider = 'meta_cloud' | 'interakt' | 'wati' | 'gupshup';

export interface WhatsAppNumberData {
  phone_number: string;
  provider:     WaProvider;
  label:        string;
  config_json:  Record<string, string>;
}

export interface UpdateWhatsAppNumberInput {
  label?:          string;
  product_slug?:   string;
  phoneNumberId?:  string;
  accessToken?:    string;
}

export async function updateWhatsAppNumberAction(
  numberId: string,
  input:    UpdateWhatsAppNumberInput,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: existing } = await admin
    .from('whatsapp_numbers')
    .select('id, tenant_id, config_json')
    .eq('id', numberId)
    .single();

  if (!existing) return { error: 'Number not found' };

  const updates: Record<string, unknown> = {};
  if (input.label        !== undefined) updates['label']        = input.label;
  if (input.product_slug !== undefined) updates['product_slug'] = input.product_slug;

  if (input.phoneNumberId !== undefined || input.accessToken !== undefined) {
    const current = (existing.config_json ?? {}) as Record<string, string>;
    updates['config_json'] = {
      ...current,
      ...(input.phoneNumberId !== undefined ? { phone_number_id: input.phoneNumberId } : {}),
      ...(input.accessToken   !== undefined ? { access_token:    input.accessToken   } : {}),
    };
  }

  const { error } = await admin
    .from('whatsapp_numbers')
    .update(updates)
    .eq('id', numberId);

  if (error) return { error: error.message };

  revalidatePath('/settings');
  return { ok: true };
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
