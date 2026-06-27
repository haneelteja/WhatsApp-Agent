import { getServerClient } from '@alphabot/database';
import { cacheGet, cacheSet, cacheDelPattern } from '../lib/redis.js';
import type { BotConfig, LayeredGuardrailsConfig, PlatformGuardrails, Product } from '@alphabot/shared';

const TTL = 60; // seconds — config changes are admin-driven and infrequent

export interface BotContext {
  whatsapp_number: { config_json: Record<string, string>; provider: string } | null;
  tenant:          { plan: string; status: string } | null;
  bot_config:      (BotConfig & { default_prompt?: string; default_model?: string; product?: Product }) | null;
  platform_guardrails: PlatformGuardrails | null;
  bot_type_guardrails: LayeredGuardrailsConfig | null;
  tenant_guardrails:   LayeredGuardrailsConfig | null;
  llm_configs:         Array<{ tenant_id: string | null; product_slug: string | null; api_key: string; model: string; base_url: string | null; validation_status: string }>;
}

/**
 * Load bot context (guardrails + LLM config + WhatsApp number) from Redis cache,
 * falling back to the get_bot_context Supabase RPC on cache miss.
 * TTL: 60 s — stale reads are acceptable for config data.
 */
export async function getBotContext(
  tenantId: string,
  productSlug: string,
  provider: string,
): Promise<BotContext> {
  const key = `bot_ctx:${tenantId}:${productSlug}:${provider}`;

  const cached = await cacheGet<BotContext>(key);
  if (cached) return cached;

  const db = getServerClient();
  const { data, error } = await db.rpc('get_bot_context', {
    p_tenant_id:   tenantId,
    p_product_slug: productSlug,
    p_provider:    provider,
  });

  if (error || !data) {
    // Fallback: return empty context — callers handle null fields gracefully
    return {
      whatsapp_number: null,
      tenant:          null,
      bot_config:      null,
      platform_guardrails: null,
      bot_type_guardrails: null,
      tenant_guardrails:   null,
      llm_configs:         [],
    };
  }

  const ctx = data as BotContext;
  await cacheSet(key, ctx, TTL);
  return ctx;
}

/**
 * Invalidate cached bot context for a tenant (call from settings PATCH routes).
 * Clears all product/provider variants for this tenant.
 */
export async function invalidateBotContext(tenantId: string, productSlug?: string): Promise<void> {
  const pattern = productSlug
    ? `bot_ctx:${tenantId}:${productSlug}:*`
    : `bot_ctx:${tenantId}:*`;
  await cacheDelPattern(pattern);
}
