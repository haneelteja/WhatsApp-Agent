'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

type ProductType = 'support_bot' | 'sales_bot' | 'lifecycle_bot';
type WaProvider = 'meta_cloud' | 'interakt' | 'wati' | 'gupshup';

async function getCallerTenant() {
  const supabase = await getSupabaseServerClient();
  const admin = getSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: tu } = await admin
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single();
  return tu;
}

export async function activateTenantProductAction(productType: ProductType) {
  const tu = await getCallerTenant();
  if (!tu) return { error: 'Not authenticated' };
  if (!['admin', 'client_manager'].includes(tu.role)) return { error: 'Admins only' };

  const admin = getSupabaseAdminClient();

  await admin.from('tenant_products').upsert(
    { tenant_id: tu.tenant_id, product_type: productType, active: true, tier: 'base' },
    { onConflict: 'tenant_id,product_type' }
  );

  // Create default bot_config if absent
  const { data: existing } = await admin
    .from('bot_configs')
    .select('id')
    .eq('tenant_id', tu.tenant_id)
    .eq('product_slug', productType)
    .maybeSingle();

  if (!existing) {
    await admin.from('bot_configs').insert({
      tenant_id: tu.tenant_id,
      product_slug: productType,
      confidence_threshold: 0.6,
      escalation_triggers: [
        'speak to human', 'talk to agent', 'human please', 'escalate',
        'complaint', 'refund', 'dispute', 'urgent',
      ],
      guardrails_json: {
        blocked_topics: [], blocked_keywords: [], max_response_length: 1000,
        tone: 'professional',
        content_filters: { no_personal_data: false, no_external_links: false, no_phone_numbers_in_response: false },
        on_blocked_topic: 'escalate',
      },
    });
  }

  revalidatePath('/settings');
  return { success: true };
}

export async function deactivateTenantProductAction(productType: ProductType) {
  const tu = await getCallerTenant();
  if (!tu) return { error: 'Not authenticated' };
  if (!['admin', 'client_manager'].includes(tu.role)) return { error: 'Admins only' };

  const admin = getSupabaseAdminClient();
  await admin
    .from('tenant_products')
    .update({ active: false })
    .eq('tenant_id', tu.tenant_id)
    .eq('product_type', productType);

  revalidatePath('/settings');
  return { success: true };
}

export async function assignNumberToBotAction(numberId: string, productSlug: ProductType | null) {
  const tu = await getCallerTenant();
  if (!tu) return { error: 'Not authenticated' };
  if (!['admin', 'client_manager'].includes(tu.role)) return { error: 'Admins only' };

  const admin = getSupabaseAdminClient();
  await admin
    .from('whatsapp_numbers')
    .update({ product_slug: productSlug })
    .eq('id', numberId)
    .eq('tenant_id', tu.tenant_id);

  revalidatePath('/settings');
  return { success: true };
}

export interface AddWhatsAppNumberInput {
  provider: WaProvider;
  phoneNumber: string;
  label: string;
  productSlug: ProductType;
  // Meta Cloud API
  phoneNumberId?: string;
  accessToken?: string;
  // Twilio
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
}

export async function addTenantWhatsAppNumberAction(input: AddWhatsAppNumberInput) {
  const tu = await getCallerTenant();
  if (!tu) return { error: 'Not authenticated' };
  if (!['admin', 'client_manager'].includes(tu.role)) return { error: 'Admins only' };

  const verifyToken = randomUUID();

  let configJson: Record<string, string> = { verify_token: verifyToken };

  if (input.provider === 'meta_cloud') {
    if (!input.phoneNumberId?.trim()) return { error: 'Phone Number ID is required for Meta Cloud API' };
    if (!input.accessToken?.trim()) return { error: 'Access Token is required for Meta Cloud API' };
    configJson = {
      verify_token: verifyToken,
      phone_number_id: input.phoneNumberId.trim(),
      access_token: input.accessToken.trim(),
    };
  } else if (input.provider === 'interakt' || input.provider === 'wati' || input.provider === 'gupshup') {
    if (!input.accessToken?.trim()) return { error: 'API Key / Access Token is required' };
    configJson = {
      verify_token: verifyToken,
      access_token: input.accessToken.trim(),
      ...(input.fromNumber ? { from_number: input.fromNumber.trim() } : {}),
    };
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('whatsapp_numbers')
    .upsert(
      {
        tenant_id: tu.tenant_id,
        phone_number: input.phoneNumber.trim(),
        provider: input.provider,
        label: input.label.trim() || null,
        product_slug: input.productSlug,
        config_json: configJson,
        active: true,
      },
      { onConflict: 'tenant_id,phone_number' }
    )
    .select('id')
    .single();

  if (error) return { error: error.message };

  revalidatePath('/settings');
  return { success: true, numberId: data.id, verifyToken };
}
