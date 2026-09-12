'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';

export type KBTopEntry = {
  entry_id:     string | null;
  question:     string;
  category:     string;
  hit_count:    number;
};

export type KBUnansweredQuery = {
  query:     string;
  count:     number;
  last_seen: string;
};

export type KBAnalyticsResult = {
  top_entries:     KBTopEntry[];
  unanswered:      KBUnansweredQuery[];
  period_days:     number;
  total_hits:      number;
  unanswered_total: number;
};

export async function getKBAnalyticsAction(): Promise<KBAnalyticsResult | null> {
  const session = await getSession();
  if (!session) return null;

  const admin   = getSupabaseAdminClient();
  const since   = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: hitRows }, { data: unansweredRows }] = await Promise.all([
    admin
      .from('kb_hit_log')
      .select('entry_id, query, created_at')
      .eq('tenant_id', session.tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2000),
    admin
      .from('kb_unanswered_queries')
      .select('query, created_at')
      .eq('tenant_id', session.tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);

  // Aggregate hit counts by entry_id
  const entryHits = new Map<string, number>();
  for (const row of hitRows ?? []) {
    if (!row.entry_id) continue;
    entryHits.set(row.entry_id, (entryHits.get(row.entry_id) ?? 0) + 1);
  }

  // Look up questions for the top-hit entry IDs
  const topEntryIds = [...entryHits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id]) => id);

  let top_entries: KBTopEntry[] = [];
  if (topEntryIds.length > 0) {
    const { data: kbRows } = await admin
      .from('knowledge_base')
      .select('id, question, category')
      .in('id', topEntryIds);

    const kbMap = new Map((kbRows ?? []).map(r => [r.id, r]));
    top_entries = topEntryIds.map(id => {
      const kb = kbMap.get(id);
      return {
        entry_id:  id,
        question:  kb?.question ?? '(deleted entry)',
        category:  kb?.category ?? '',
        hit_count: entryHits.get(id) ?? 0,
      };
    });
  }

  // Aggregate unanswered queries
  const queryCount  = new Map<string, number>();
  const queryLast   = new Map<string, string>();
  for (const row of unansweredRows ?? []) {
    const q = row.query.toLowerCase().trim();
    queryCount.set(q, (queryCount.get(q) ?? 0) + 1);
    if (!queryLast.has(q)) queryLast.set(q, row.created_at);
  }
  const unanswered: KBUnansweredQuery[] = [...queryCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([query, count]) => ({
      query,
      count,
      last_seen: queryLast.get(query) ?? '',
    }));

  return {
    top_entries,
    unanswered,
    period_days:      30,
    total_hits:       hitRows?.length ?? 0,
    unanswered_total: unansweredRows?.length ?? 0,
  };
}
