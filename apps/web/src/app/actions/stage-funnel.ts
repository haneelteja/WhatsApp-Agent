'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export interface StageFunnelRow {
  product_type: string;
  stage:        string;
  count:        number;
}

export async function getStageFunnelAction(tenantId: string, days = 30): Promise<StageFunnelRow[]> {
  const admin = getSupabaseAdminClient();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  // Count distinct conversations that reached each stage within the window.
  // We use to_stage to represent "arrived at this stage".
  const { data, error } = await admin
    .from('conversation_stage_events')
    .select('product_type, to_stage, conversation_id')
    .eq('tenant_id', tenantId)
    .gte('recorded_at', since);

  if (error || !data) return [];

  // Group: product_type + to_stage → distinct conversation count
  const map: Record<string, Set<string>> = {};
  for (const row of data) {
    const key = `${row.product_type}||${row.to_stage}`;
    if (!map[key]) map[key] = new Set();
    map[key]!.add(row.conversation_id as string);
  }

  return Object.entries(map).map(([key, set]) => {
    const [product_type, stage] = key.split('||') as [string, string];
    return { product_type, stage, count: set.size };
  });
}
