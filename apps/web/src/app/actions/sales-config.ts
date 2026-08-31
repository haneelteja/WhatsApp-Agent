'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';
import { revalidatePath }         from 'next/cache';
import type { SalesConfig }       from '@alphabot/shared';

export async function saveSalesConfigAction(
  patch: Partial<SalesConfig>,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();

  const { data: bc } = await admin
    .from('bot_configs')
    .select('id, sales_config')
    .eq('tenant_id', session.tenantId)
    .eq('product_slug', 'sales_bot')
    .single();

  if (!bc) {
    const { error } = await admin.from('bot_configs').insert({
      tenant_id:    session.tenantId,
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
