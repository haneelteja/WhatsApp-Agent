'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { revalidatePath } from 'next/cache';

export async function getBotToolsAction(): Promise<{ product_slug: string; allowed_tools: string[] }[]> {
  const session = await getSession();
  if (!session) return [];
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('bot_configs')
    .select('product_slug, allowed_tools')
    .eq('tenant_id', session.tenantId);
  return (data ?? []) as { product_slug: string; allowed_tools: string[] }[];
}

export async function saveBotToolsAction(
  productSlug: string,
  tools: string[],
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('bot_configs')
    .upsert(
      { tenant_id: session.tenantId, product_slug: productSlug, allowed_tools: tools, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id,product_slug', ignoreDuplicates: false },
    );

  if (error) return { error: error.message };
  revalidatePath('/settings');
  return {};
}
