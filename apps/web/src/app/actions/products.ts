'use server';

import { revalidatePath }          from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient }  from '@/lib/supabase/admin';
import { getSession }              from '@/lib/session';
import type { ProductCatalogueItem } from '@alphabot/shared';

// ── Platform admin actions (used by /platform pages) ─────────────────────────

export async function createBotProductAction(input: {
  name:           string;
  slug:           string;
  description?:   string;
  default_prompt: string;
  default_model:  string;
}): Promise<{ error?: string }> {
  if (!input.name?.trim())   return { error: 'Name is required' };
  if (!input.slug?.trim())   return { error: 'Slug is required' };
  if (!input.default_prompt?.trim()) return { error: 'Default system prompt is required' };
  if (!input.default_model?.trim()) return { error: 'Default AI model is required' };
  if (!/^[a-z][a-z0-9_]*$/.test(input.slug.trim())) {
    return { error: 'Slug must start with a letter and contain only lowercase letters, numbers, and underscores' };
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('products')
    .insert({
      slug:           input.slug.trim(),
      name:           input.name.trim(),
      description:    input.description?.trim() || null,
      default_prompt: input.default_prompt.trim(),
      default_model:  input.default_model.trim(),
      active:         true,
    });

  if (error) return { error: error.message };
  revalidatePath('/platform/products');
  revalidatePath('/platform/guardrails');
  return {};
}

export async function saveProductDefaultsAction(
  slug:          string,
  defaultPrompt: string,
  defaultModel:  string,
) {
  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('products')
    .update({ default_prompt: defaultPrompt.trim(), default_model: defaultModel.trim() })
    .eq('slug', slug);
  if (error) return { error: error.message };
  revalidatePath('/platform/products');
  return { success: true };
}

export async function toggleClientProductAction(
  tenantId:    string,
  productSlug: string,
  active:      boolean,
) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { data: platformUser } = await admin
    .from('platform_users')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!platformUser) return { error: 'Unauthorized' };

  if (active) {
    await admin.from('tenant_products').upsert({
      tenant_id: tenantId, product_type: productSlug, tier: 'base', active: true,
    }, { onConflict: 'tenant_id,product_type' });

    const { data: existing } = await admin
      .from('bot_configs')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('product_slug', productSlug)
      .maybeSingle();

    if (!existing) {
      await admin.from('bot_configs').insert({
        tenant_id: tenantId, product_slug: productSlug,
        system_prompt: null, ai_model: null, confidence_threshold: 0.6, kb_only_mode: false,
        escalation_triggers: ['speak to human', 'talk to agent', 'human please', 'escalate', 'complaint', 'refund', 'dispute', 'urgent'],
        guardrails_json: {
          blocked_topics: [], blocked_keywords: [], max_response_length: 1000,
          tone: 'professional',
          content_filters: { no_personal_data: false, no_external_links: false, no_phone_numbers_in_response: false },
          on_blocked_topic: 'escalate', on_low_confidence: 'escalate',
        },
      });
    }
  } else {
    await admin.from('tenant_products').update({ active: false })
      .eq('tenant_id', tenantId).eq('product_type', productSlug);
  }

  revalidatePath(`/platform/clients/${tenantId}`);
  return { success: true };
}

// ── Tenant product catalogue actions ─────────────────────────────────────────

export async function getProductsAction(): Promise<{ products: ProductCatalogueItem[]; error?: string }> {
  const session = await getSession();
  if (!session) return { products: [], error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('product_catalogue')
    .select('*')
    .eq('tenant_id', session.tenantId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) return { products: [], error: error.message };
  return { products: (data ?? []) as ProductCatalogueItem[] };
}

export async function createProductAction(input: {
  name:        string;
  description?: string;
  price_inr?:  number | null;
  category?:   string;
  sku?:        string;
}): Promise<{ product?: ProductCatalogueItem; error?: string }> {
  if (!input.name?.trim()) return { error: 'Name is required' };

  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('product_catalogue')
    .insert({
      tenant_id:   session.tenantId,
      name:        input.name.trim(),
      description: input.description?.trim() || null,
      price_inr:   input.price_inr ?? null,
      category:    input.category?.trim() || null,
      sku:         input.sku?.trim() || null,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { product: data as ProductCatalogueItem };
}

export async function updateProductAction(
  id:    string,
  input: Partial<{
    name:        string;
    description: string | null;
    price_inr:   number | null;
    category:    string | null;
    sku:         string | null;
    active:      boolean;
  }>,
): Promise<{ error?: string }> {
  if (!id) return { error: 'Missing id' };

  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('product_catalogue')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', session.tenantId);

  if (error) return { error: error.message };
  return {};
}

export async function deleteProductAction(id: string): Promise<{ error?: string }> {
  if (!id) return { error: 'Missing id' };

  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('product_catalogue')
    .delete()
    .eq('id', id)
    .eq('tenant_id', session.tenantId);

  if (error) return { error: error.message };
  return {};
}
