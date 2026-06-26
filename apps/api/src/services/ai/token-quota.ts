import { getServerClient } from '@alphabot/database';
import type { TenantPlan } from '@alphabot/shared';

const PLAN_TOKEN_LIMITS: Record<TenantPlan | string, number> = {
  starter: 2_000_000,    // ~2,000 average WhatsApp replies
  growth:  10_000_000,   // ~10,000 replies
  scale:   Infinity,
};

export interface TokenQuotaResult {
  allowed:   boolean;
  used:      number;
  limit:     number;
  remaining: number;
}

/**
 * Check whether a tenant has remaining token quota for the current calendar month.
 * Sums all ai_token_used events from usage_events since the 1st of this month.
 */
export async function checkTokenQuota(
  tenantId: string,
  plan: string,
): Promise<TokenQuotaResult> {
  const limit = PLAN_TOKEN_LIMITS[plan] ?? PLAN_TOKEN_LIMITS.starter;

  if (!isFinite(limit)) {
    return { allowed: true, used: 0, limit: Infinity, remaining: Infinity };
  }

  const db = getServerClient();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const { data, error } = await db
    .from('usage_events')
    .select('token_count')
    .eq('tenant_id', tenantId)
    .eq('event_type', 'ai_token_used')
    .gte('created_at', monthStart);

  if (error) {
    // On DB error, allow the call — don't silently block tenants due to infra issues
    console.error('[TokenQuota] Failed to fetch usage:', error.message);
    return { allowed: true, used: 0, limit, remaining: limit };
  }

  const used = (data ?? []).reduce((sum, row) => sum + (row.token_count ?? 0), 0);
  const remaining = Math.max(0, limit - used);

  return { allowed: used < limit, used, limit, remaining };
}
