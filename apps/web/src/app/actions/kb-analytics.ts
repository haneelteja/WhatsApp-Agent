'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';

export interface QueryCount {
  query: string;
  count: number;
}

/** Entry-level analytics used by the KB management page analytics tab. */
export interface KBEntryHit {
  entry_id:  string | null;
  question:  string;
  category:  string | null;
  hit_count: number;
}

export interface KBAnalyticsResult {
  total_hits:       number;
  unanswered_total: number;
  top_entries:      KBEntryHit[];
  unanswered:       QueryCount[];
}

/** Aggregate analytics used by the main analytics dashboard. */
export interface KBAnalytics {
  hitCount:        number;
  unansweredCount: number;
  topQueries:      QueryCount[];
  topUnanswered:   QueryCount[];
}

export async function getKBAnalyticsAction(days = 30): Promise<KBAnalytics> {
  const session = await getSession();
  if (!session) return { hitCount: 0, unansweredCount: 0, topQueries: [], topUnanswered: [] };

  const admin = getSupabaseAdminClient();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [{ data: hits }, { data: unanswered }] = await Promise.all([
    admin
      .from('kb_hit_log')
      .select('query')
      .eq('tenant_id', session.tenantId)
      .gte('created_at', since)
      .limit(2000),
    admin
      .from('kb_unanswered_queries')
      .select('query')
      .eq('tenant_id', session.tenantId)
      .gte('created_at', since)
      .limit(2000),
  ]);

  function groupByQuery(rows: { query: string }[]): QueryCount[] {
    const countMap: Record<string, number> = {};
    const displayMap: Record<string, string> = {};
    for (const r of rows) {
      const key = r.query.trim().toLowerCase().slice(0, 120);
      if (!displayMap[key]) displayMap[key] = r.query.trim().slice(0, 120);
      countMap[key] = (countMap[key] ?? 0) + 1;
    }
    return Object.entries(countMap)
      .map(([key, count]) => ({ query: displayMap[key] ?? key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  return {
    hitCount:        (hits ?? []).length,
    unansweredCount: (unanswered ?? []).length,
    topQueries:      groupByQuery(hits ?? []),
    topUnanswered:   groupByQuery(unanswered ?? []),
  };
}

/** Entry-level analytics for the KB page analytics tab. */
export async function getKBPageAnalyticsAction(days = 30): Promise<KBAnalyticsResult> {
  const empty: KBAnalyticsResult = { total_hits: 0, unanswered_total: 0, top_entries: [], unanswered: [] };
  const session = await getSession();
  if (!session) return empty;

  const admin = getSupabaseAdminClient();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [{ data: hitRows }, { data: unansweredRows }] = await Promise.all([
    admin
      .from('kb_hit_log')
      .select('entry_id, query')
      .eq('tenant_id', session.tenantId)
      .gte('created_at', since)
      .limit(2000),
    admin
      .from('kb_unanswered_queries')
      .select('query')
      .eq('tenant_id', session.tenantId)
      .gte('created_at', since)
      .limit(2000),
  ]);

  // Group hits by entry_id
  const entryCounts: Record<string, number> = {};
  for (const r of hitRows ?? []) {
    if (r.entry_id) entryCounts[r.entry_id] = (entryCounts[r.entry_id] ?? 0) + 1;
  }

  // Fetch KB entry details for the top hit entry IDs
  const topEntryIds = Object.entries(entryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id);

  let topEntries: KBEntryHit[] = [];
  if (topEntryIds.length > 0) {
    const { data: kbRows } = await admin
      .from('knowledge_base')
      .select('id, question, category')
      .in('id', topEntryIds);
    const kbMap = Object.fromEntries((kbRows ?? []).map(r => [r.id, r]));
    topEntries = topEntryIds
      .filter(id => kbMap[id])
      .map(id => ({
        entry_id:  id,
        question:  kbMap[id]!.question ?? '',
        category:  kbMap[id]!.category ?? null,
        hit_count: entryCounts[id] ?? 0,
      }));
  }

  // Group unanswered by query text
  const unansweredMap: Record<string, number> = {};
  for (const r of unansweredRows ?? []) {
    const key = r.query.trim().toLowerCase().slice(0, 120);
    unansweredMap[key] = (unansweredMap[key] ?? 0) + 1;
  }
  const unanswered: QueryCount[] = Object.entries(unansweredMap)
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    total_hits:       (hitRows ?? []).length,
    unanswered_total: (unansweredRows ?? []).length,
    top_entries:      topEntries,
    unanswered,
  };
}
