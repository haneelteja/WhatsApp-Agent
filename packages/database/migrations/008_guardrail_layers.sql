-- ─── Layer 2: Per-bot-type guardrails (platform-set, per product slug) ──────────
-- Allows platform managers to set default rules for each bot type
-- (e.g. all support_bots anywhere must never discuss competitor pricing)
CREATE TABLE IF NOT EXISTS bot_type_guardrails (
  product_slug    TEXT PRIMARY KEY,
  guardrails_json JSONB NOT NULL DEFAULT '{
    "blocked_topics": [],
    "blocked_keywords": [],
    "max_response_length": 2000,
    "kb_only_mode": false,
    "no_personal_data": false,
    "no_external_links": false,
    "on_blocked_topic": "escalate"
  }',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID
);

-- Seed one row per product so the UI always has a row to UPSERT
INSERT INTO bot_type_guardrails (product_slug) VALUES
  ('support_bot'),
  ('sales_bot'),
  ('lifecycle_bot')
ON CONFLICT (product_slug) DO NOTHING;

-- ─── Layer 3: Per-client guardrails (applies across ALL bots for a tenant) ──────
-- Platform managers or client managers can set rules that cover every bot the
-- client has, without needing to repeat them per-bot in bot_configs.
CREATE TABLE IF NOT EXISTS tenant_guardrails (
  tenant_id       UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  guardrails_json JSONB NOT NULL DEFAULT '{
    "blocked_topics": [],
    "blocked_keywords": [],
    "max_response_length": 2000,
    "kb_only_mode": false,
    "no_personal_data": false,
    "no_external_links": false,
    "on_blocked_topic": "escalate"
  }',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID
);

-- ─── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE bot_type_guardrails ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_guardrails   ENABLE ROW LEVEL SECURITY;

-- Service role (API, admin client) can do anything
CREATE POLICY "service_role_all_bot_type_guardrails"
  ON bot_type_guardrails FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_tenant_guardrails"
  ON tenant_guardrails FOR ALL TO service_role USING (true) WITH CHECK (true);

-- API webhook reads bot_type_guardrails as authenticated user
CREATE POLICY "authenticated_read_bot_type_guardrails"
  ON bot_type_guardrails FOR SELECT TO authenticated USING (true);

-- Clients can read their own tenant_guardrails
CREATE POLICY "tenant_read_own_guardrails"
  ON tenant_guardrails FOR SELECT TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
  ));
