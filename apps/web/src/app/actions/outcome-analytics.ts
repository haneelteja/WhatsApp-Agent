'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';

export interface OutcomeCount {
  outcome: string;
  count:   number;
}

export async function getOutcomeAnalyticsAction(days = 30): Promise<OutcomeCount[]> {
  const session = await getSession();
  if (!session) return [];

  const admin = getSupabaseAdminClient();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data } = await admin
    .from('conversations')
    .select('terminal_outcome')
    .eq('tenant_id', session.tenantId)
    .not('terminal_outcome', 'is', null)
    .gte('outcome_set_at', since);

  const counts: Record<string, number> = {};
  for (const row of (data ?? [])) {
    const o = (row as { terminal_outcome: string }).terminal_outcome;
    counts[o] = (counts[o] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([outcome, count]) => ({ outcome, count }))
    .sort((a, b) => b.count - a.count);
}
