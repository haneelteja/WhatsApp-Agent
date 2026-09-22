'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';

export interface QueryCount {
  query: string;
  count: number;
}

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
