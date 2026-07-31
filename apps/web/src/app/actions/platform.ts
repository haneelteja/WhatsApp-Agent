'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function createTenantAction(formData: FormData) {
  const supabase = getSupabaseAdminClient();

  const name = (formData.get('name') as string | null)?.trim();
  const contactEmail = (formData.get('contactEmail') as string | null)?.trim();
  const plan = (formData.get('plan') as string) || 'starter';
  const trialDays = parseInt((formData.get('trialDays') as string) || '0', 10);
  const products = formData.getAll('products') as string[];

  if (!name || !contactEmail || products.length === 0) return;

  // 1. Create tenant
  const { data: tenant, error } = await supabase
    .from('tenants')
    .insert({
      name,
      contact_email: contactEmail,
      plan,
      status: trialDays > 0 ? 'trial' : 'active',
      provider: 'meta_cloud',
    })
    .select()
    .single();

  if (error || !tenant) {
    console.error('[createTenantAction] tenant insert failed', error);
    return;
  }

  // 2. For each selected product: tenant_products + bot_configs
  for (const productSlug of products) {
    await supabase.from('tenant_products').insert({
      tenant_id: tenant.id,
      product_type: productSlug,
      tier: 'base',
      active: true,
    });

    await supabase.from('bot_configs').insert({
      tenant_id: tenant.id,
      product_slug: productSlug,
      system_prompt: null,  // falls back to products.default_prompt at query time
      ai_model: null,       // falls back to products.default_model at query time
      confidence_threshold: 0.6,
      escalation_triggers: [
        'speak to human', 'talk to agent', 'human please', 'escalate',
        'complaint', 'refund', 'dispute', 'urgent',
      ],
      guardrails_json: {
        blocked_topics: [],
        blocked_keywords: [],
        max_response_length: 1000,
        tone: 'professional',
        content_filters: {
          no_personal_data: false,
          no_external_links: false,
          no_phone_numbers_in_response: false,
        },
        on_blocked_topic: 'escalate',
        on_low_confidence: 'escalate',
      },
    });
  }

  // 3. Free trial if requested
  if (trialDays > 0) {
    const endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + trialDays);

    for (const productSlug of products) {
      await supabase.from('free_trials').insert({
        tenant_id: tenant.id,
        product_slug: productSlug,
        ends_at: endsAt.toISOString(),
        status: 'active',
        allowed_model: 'claude-sonnet-4-6',
      });
    }
  }

  redirect(`/platform/clients/${tenant.id}`);
}

export async function updateTenantStatusAction(tenantId: string, status: string) {
  const supabase = getSupabaseAdminClient();
  await supabase.from('tenants').update({ status }).eq('id', tenantId);
}

export async function updateContactEmailAction(tenantId: string, email: string): Promise<{ error?: string }> {
  const trimmed = email.trim();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { error: 'Invalid email address' };
  }
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('tenants')
    .update({ contact_email: trimmed })
    .eq('id', tenantId);
  if (error) return { error: error.message };
  revalidatePath(`/platform/clients/${tenantId}`);
  revalidatePath('/platform/clients');
  return {};
}
