'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

type ProductType = 'support_bot' | 'sales_bot' | 'lifecycle_bot';

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
