'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';

export interface FollowupStats {
  total:     number;
  /** Booked before follow-up nudge fired (cancelled_at IS NOT NULL) */
  converted: number;
  /** Nudge was sent (fired_at IS NOT NULL, not cancelled) */
  nudged:    number;
  /** Not yet fired and not cancelled */
  pending:   number;
}

export async function getFollowupAnalyticsAction(days = 30): Promise<FollowupStats> {
  const session = await getSession();
  if (!session) return { total: 0, converted: 0, nudged: 0, pending: 0 };

  const admin = getSupabaseAdminClient();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data } = await admin
    .from('enquiry_followup_jobs')
    .select('fired_at, cancelled_at')
    .eq('tenant_id', session.tenantId)
    .gte('created_at', since);

  const rows = data ?? [];
  return {
    total:     rows.length,
    converted: rows.filter(r => r.cancelled_at !== null).length,
    nudged:    rows.filter(r => r.fired_at !== null && r.cancelled_at === null).length,
    pending:   rows.filter(r => r.fired_at === null && r.cancelled_at === null).length,
  };
}
