'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { SalesConfig } from '@alphabot/shared';

export async function saveSalesConfigAction(
  patch: Partial<SalesConfig>,
): Promise<{ error?: string }> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();

  const { data: tu } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();
  if (!tu) return { error: 'Tenant not found' };

  // Upsert bot_configs row for sales_bot (it may not exist yet)
  const { data: bc } = await admin
    .from('bot_configs')
    .select('id, sales_config')
    .eq('tenant_id', tu.tenant_id)
    .eq('product_slug', 'sales_bot')
    .single();

  if (!bc) {
    // Create the bot_config row with just sales_config
    const { error } = await admin.from('bot_configs').insert({
      tenant_id:    tu.tenant_id,
      product_slug: 'sales_bot',
      sales_config: patch,
    });
    if (error) return { error: error.message };
    revalidatePath('/settings');
    return {};
  }

  const current = (bc.sales_config ?? {}) as Partial<SalesConfig>;
  const merged  = { ...current, ...patch };

  const { error } = await admin
    .from('bot_configs')
    .update({ sales_config: merged })
    .eq('id', bc.id);

  if (error) return { error: error.message };
  revalidatePath('/settings');
  return {};
}
