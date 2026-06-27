-- ─── Performance Improvements Migration ──────────────────────────────────────
-- All statements are additive and idempotent (IF NOT EXISTS / OR REPLACE).

-- ─── 1. Missing indexes ───────────────────────────────────────────────────────

-- Dashboard: conversations list ordered by recency per tenant
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_updated
  ON conversations (tenant_id, updated_at DESC);

-- Webhook: history fetch — last N messages per conversation
-- messages table uses "timestamp" (not created_at) for its time column
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, timestamp DESC);

-- Token quota: range scan on ai_token_used events per tenant/month
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_type_created
  ON usage_events (tenant_id, event_type, created_at DESC)
  WHERE event_type = 'ai_token_used';

-- Escalation queue: open/assigned escalations per tenant
CREATE INDEX IF NOT EXISTS idx_escalations_tenant_status
  ON escalations (tenant_id, status)
  WHERE status IN ('open', 'assigned');

-- Contact upsert / lookup on incoming message
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_phone
  ON contacts (tenant_id, phone);

-- ─── 2. Token usage monthly aggregate table ───────────────────────────────────
-- Replaces O(n) scan of usage_events with O(1) lookup.
-- Trigger keeps it in sync on every ai_token_used insert.

CREATE TABLE IF NOT EXISTS tenant_token_usage_monthly (
  tenant_id   UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  month       DATE    NOT NULL,   -- always the 1st day of the month
  tokens_used BIGINT  NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, month)
);

CREATE INDEX IF NOT EXISTS idx_token_usage_monthly_tenant_month
  ON tenant_token_usage_monthly (tenant_id, month DESC);

-- Trigger function: upsert-increment on every ai_token_used event insert
CREATE OR REPLACE FUNCTION fn_increment_token_usage()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO tenant_token_usage_monthly (tenant_id, month, tokens_used)
  VALUES (
    NEW.tenant_id,
    date_trunc('month', NEW.created_at)::DATE,
    COALESCE(NEW.token_count, 0)
  )
  ON CONFLICT (tenant_id, month)
  DO UPDATE SET tokens_used = tenant_token_usage_monthly.tokens_used + EXCLUDED.tokens_used;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_token_usage ON usage_events;
CREATE TRIGGER trg_increment_token_usage
  AFTER INSERT ON usage_events
  FOR EACH ROW
  WHEN (NEW.event_type = 'ai_token_used' AND NEW.tenant_id IS NOT NULL)
  EXECUTE FUNCTION fn_increment_token_usage();

-- Backfill existing data into the aggregate table
INSERT INTO tenant_token_usage_monthly (tenant_id, month, tokens_used)
SELECT
  tenant_id,
  date_trunc('month', created_at)::DATE AS month,
  SUM(COALESCE(token_count, 0))         AS tokens_used
FROM usage_events
WHERE event_type = 'ai_token_used'
  AND tenant_id IS NOT NULL
GROUP BY tenant_id, date_trunc('month', created_at)::DATE
ON CONFLICT (tenant_id, month)
DO UPDATE SET tokens_used = EXCLUDED.tokens_used;

-- ─── 3. get_bot_context RPC — consolidate 7 parallel queries into 1 ──────────

CREATE OR REPLACE FUNCTION get_bot_context(
  p_tenant_id   UUID,
  p_product_slug TEXT,
  p_provider    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'whatsapp_number', (
      SELECT row_to_json(wn)
      FROM whatsapp_numbers wn
      WHERE wn.tenant_id    = p_tenant_id
        AND wn.product_slug = p_product_slug
        AND wn.provider     = p_provider
        AND wn.active       = true
      LIMIT 1
    ),
    'tenant', (
      SELECT row_to_json(t)
      FROM tenants t
      WHERE t.id = p_tenant_id
    ),
    'bot_config', (
      SELECT jsonb_build_object(
        'id',                   bc.id,
        'system_prompt',        bc.system_prompt,
        'ai_model',             bc.ai_model,
        'confidence_threshold', bc.confidence_threshold,
        'escalation_triggers',  bc.escalation_triggers,
        'guardrails_json',      bc.guardrails_json,
        'escalation_policy',    bc.escalation_policy,
        'default_prompt',       p.default_prompt,
        'default_model',        p.default_model
      )
      FROM bot_configs bc
      LEFT JOIN products p ON p.id = bc.product_id
      WHERE bc.tenant_id    = p_tenant_id
        AND bc.product_slug = p_product_slug
      LIMIT 1
    ),
    'platform_guardrails', (
      SELECT value
      FROM platform_settings
      WHERE key = 'guardrails'
      LIMIT 1
    ),
    'bot_type_guardrails', (
      SELECT guardrails_json
      FROM bot_type_guardrails
      WHERE product_slug = p_product_slug
      LIMIT 1
    ),
    'tenant_guardrails', (
      SELECT guardrails_json
      FROM tenant_guardrails
      WHERE tenant_id = p_tenant_id
      LIMIT 1
    ),
    'llm_configs', (
      SELECT jsonb_agg(row_to_json(lc))
      FROM llm_configs lc
      WHERE (lc.tenant_id IS NULL OR lc.tenant_id = p_tenant_id)
        AND (lc.product_slug IS NULL OR lc.product_slug = p_product_slug)
    )
  ) INTO result;

  RETURN result;
END;
$$;
