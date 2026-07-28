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

const EMPTY_CONTEXT: BotContext = {
  whatsapp_number: null,
  tenant:          null,
  bot_config:      null,
  platform_guardrails: null,
  bot_type_guardrails: null,
  tenant_guardrails:   null,
  llm_configs:         [],
};

/**
 * Load bot context from Redis cache, falling back to the get_bot_context RPC,
 * then falling back to direct DB queries if the RPC fails.
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

  // Try the RPC first (single round-trip, cached result)
  try {
    const { data, error } = await db.rpc('get_bot_context', {
      p_tenant_id:    tenantId,
      p_product_slug: productSlug,
      p_provider:     provider,
    });

    if (error) {
      console.error(`[BotContext] RPC error for ${tenantId}/${productSlug}/${provider}:`, error.message);
    } else if (data) {
      const ctx = data as BotContext;
      // Only cache and return if whatsapp_number was found — otherwise fall through to direct query
      if (ctx.whatsapp_number) {
        await cacheSet(key, ctx, TTL);
        return ctx;
      }
    }
  } catch (rpcErr) {
    console.error('[BotContext] RPC threw:', rpcErr instanceof Error ? rpcErr.message : rpcErr);
  }

  // Fallback: query whatsapp_numbers directly (RPC failed or returned null whatsapp_number)
  console.warn(`[BotContext] Falling back to direct query for ${tenantId}/${productSlug}/${provider}`);
  const { data: wn, error: wnErr } = await db
    .from('whatsapp_numbers')
    .select('config_json, provider')
    .eq('tenant_id', tenantId)
    .eq('product_slug', productSlug)
    .eq('provider', provider)
    .eq('active', true)
    .single();

  if (wnErr || !wn) {
    return EMPTY_CONTEXT;
  }

  // Load remaining context in parallel
  const [tenantRes, botConfigRes, platformGRes, botTypeGRes, tenantGRes, llmRes] = await Promise.all([
    db.from('tenants').select('plan, status').eq('id', tenantId).single(),
    db.from('bot_configs')
      .select('id, system_prompt, ai_model, confidence_threshold, escalation_triggers, guardrails_json, escalation_policy')
      .eq('tenant_id', tenantId)
      .eq('product_slug', productSlug)
      .single(),
    db.from('platform_settings').select('value').eq('key', 'guardrails').single(),
    db.from('bot_type_guardrails').select('guardrails_json').eq('product_slug', productSlug).single(),
    db.from('tenant_guardrails').select('guardrails_json').eq('tenant_id', tenantId).single(),
    db.from('llm_configs').select('tenant_id, product_slug, api_key, model, base_url, validation_status')
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .or(`product_slug.is.null,product_slug.eq.${productSlug}`),
  ]);

  const ctx: BotContext = {
    whatsapp_number:     wn as { config_json: Record<string, string>; provider: string },
    tenant:              (tenantRes.data as { plan: string; status: string } | null) ?? null,
    bot_config:          (botConfigRes.data as BotContext['bot_config']) ?? null,
    platform_guardrails: (platformGRes.data as { value: PlatformGuardrails } | null)?.value ?? null,
    bot_type_guardrails: (botTypeGRes.data as { guardrails_json: LayeredGuardrailsConfig } | null)?.guardrails_json ?? null,
    tenant_guardrails:   (tenantGRes.data as { guardrails_json: LayeredGuardrailsConfig } | null)?.guardrails_json ?? null,
    llm_configs:         (llmRes.data ?? []) as BotContext['llm_configs'],
  };

  await cacheSet(key, ctx, TTL);
  return ctx;
}

/**
 * Invalidate cached bot context for a tenant (call from settings PATCH routes).
 */
export async function invalidateBotContext(tenantId: string, productSlug?: string): Promise<void> {
  const pattern = productSlug
    ? `bot_ctx:${tenantId}:${productSlug}:*`
    : `bot_ctx:${tenantId}:*`;
  await cacheDelPattern(pattern);
}
