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

/** Unix timestamp for the start of next month (UTC) — used as the key's absolute expiry. */
function monthExpiry(): number {
  const now = new Date();
  return Math.floor(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).getTime() / 1000,
  );
}

/**
 * Increment the Redis token counter after a successful AI call.
 * Uses INCRBY + EXPIREAT in a pipeline so the key always carries a TTL —
 * a bare INCRBY on an expired (auto-deleted) key would recreate it with no
 * expiry, causing the counter to accumulate across calendar months.
 * Called non-blocking after the response is sent — the DB trigger keeps
 * tenant_token_usage_monthly in sync asynchronously via usage_events insert.
 */
export async function incrementTokenCounter(tenantId: string, tokens: number): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  const cacheKey = `token_quota:${tenantId}:${month}`;
  try {
    const { getRedis } = await import('../../lib/redis.js');
    const redis = getRedis();
    if (redis) {
      const pipeline = redis.pipeline();
      pipeline.incrby(cacheKey, tokens);
      pipeline.expireat(cacheKey, monthExpiry());
      await pipeline.exec();
    }
  } catch {
    // Non-fatal — DB trigger is the source of truth
  }
}
