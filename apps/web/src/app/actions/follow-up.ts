'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';

interface FollowUpConfig {
  enabled:          boolean;
  idle_days:        number;
  message_template: string;
  max_follow_ups:   number;
}

async function getCallerTenantId(): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();
  return data?.tenant_id ?? null;
}

export async function saveFollowUpConfigAction(productSlug: string, config: FollowUpConfig) {
  const tenantId = await getCallerTenantId();
  if (!tenantId) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();

  const { data: existing } = await admin
    .from('follow_up_configs')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('product_slug', productSlug)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from('follow_up_configs')
      .update({ ...config, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await admin
      .from('follow_up_configs')
      .insert({ tenant_id: tenantId, product_slug: productSlug, ...config });
    if (error) return { error: error.message };
  }

  revalidatePath('/follow-ups');
  return { ok: true };
}
