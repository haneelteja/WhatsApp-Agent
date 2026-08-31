'use server';

import { revalidatePath }         from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';

export type FollowUpScope = 'all' | 'include' | 'exclude';

interface FollowUpConfig {
  enabled:          boolean;
  idle_days:        number;
  message_template: string;
  max_follow_ups:   number;
  scope:            FollowUpScope;
  contact_ids:      string[];
}

export async function saveFollowUpConfigAction(productSlug: string, config: FollowUpConfig) {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();

  const { data: existing } = await admin
    .from('follow_up_configs')
    .select('id')
    .eq('tenant_id', session.tenantId)
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
      .insert({ tenant_id: session.tenantId, product_slug: productSlug, ...config });
    if (error) return { error: error.message };
  }

  revalidatePath('/call-triggers');
  return { ok: true };
}
