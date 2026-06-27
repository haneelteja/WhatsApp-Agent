import { getServerClient } from '@alphabot/database';
import { cacheGet, cacheSet } from '../../lib/redis.js';
import type { TenantPlan } from '@alphabot/shared';

const PLAN_TOKEN_LIMITS: Record<TenantPlan | string, number> = {
  starter: 2_000_000,
  growth:  10_000_000,
  scale:   Infinity,
};

export interface TokenQuotaResult {
  allowed:   boolean;
  used:      number;
  limit:     number;
  remaining: number;
}

/**
 * Check token quota using Redis counter (O(1)) with lazy DB seed on cache miss.
 * Falls back to direct DB scan if Redis is unavailable.
 */
export async function checkTokenQuota(
  tenantId: string,
  plan: string,
): Promise<TokenQuotaResult> {
  const limit = PLAN_TOKEN_LIMITS[plan] ?? PLAN_TOKEN_LIMITS.starter;

  if (!isFinite(limit)) {
    return { allowed: true, used: 0, limit: Infinity, remaining: Infinity };
  }

  const month = new Date().toISOString().slice(0, 7); // "2026-06"
  const cacheKey = `token_quota:${tenantId}:${month}`;

  // Try Redis first
  const cached = await cacheGet<number>(cacheKey);
  if (cached !== null) {
    const remaining = Math.max(0, limit - cached);
    return { allowed: cached < limit, used: cached, limit, remaining };
  }

  // Cache miss — seed from the aggregate table (O(1) via trigger-maintained row)
  const db = getServerClient();
  const monthDate = `${month}-01`;

  const { data, error } = await db
    .from('tenant_token_usage_monthly')
    .select('tokens_used')
    .eq('tenant_id', tenantId)
    .eq('month', monthDate)
    .maybeSingle();

  if (error) {
    // DB error — allow the call, don't silently block tenants
    console.error('[TokenQuota] Failed to fetch usage:', error.message);
    return { allowed: true, used: 0, limit, remaining: limit };
  }

  const used = data?.tokens_used ?? 0;
  // Cache for 35 s (slightly beyond 30 s to survive minute-rollover clock drift)
  await cacheSet(cacheKey, used, 35);

  const remaining = Math.max(0, limit - used);
  return { allowed: used < limit, used, limit, remaining };
}

/**
 * Increment the Redis token counter after a successful AI call.
 * Called non-blocking after the response is sent — the DB trigger keeps
 * tenant_token_usage_monthly in sync asynchronously via usage_events insert.
 */
export async function incrementTokenCounter(tenantId: string, tokens: number): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  const cacheKey = `token_quota:${tenantId}:${month}`;
  try {
    await import('../../lib/redis.js').then(({ getRedis }) =>
      getRedis().incrby(cacheKey, tokens)
    );
  } catch {
    // Non-fatal — DB trigger is the source of truth
  }
}
