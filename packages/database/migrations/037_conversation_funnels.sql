-- Migration 037: Conversation stage events (funnel analytics) + bot persona fields

-- ─────────────────────────────────────────────────────────────────────────────
-- conversation_stage_events
-- Logged every time the LLM emits a [STAGE:x] marker that differs from the
-- current stage. Drives funnel drop-off analytics on the analytics page.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_stage_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tenant_id       uuid        NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  product_type    text        NOT NULL,
  from_stage      text,
  to_stage        text        NOT NULL,
  trigger         text        NOT NULL DEFAULT 'llm_marker',  -- 'llm_marker' | 'manual'
  recorded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cse_tenant_product
  ON conversation_stage_events(tenant_id, product_type);

CREATE INDEX IF NOT EXISTS idx_cse_conversation
  ON conversation_stage_events(conversation_id);

CREATE INDEX IF NOT EXISTS idx_cse_recorded_at
  ON conversation_stage_events(tenant_id, recorded_at DESC);

ALTER TABLE conversation_stage_events ENABLE ROW LEVEL SECURITY;

-- Only service_role accesses this table (analytics queries use service key)
GRANT ALL ON conversation_stage_events TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Persona fields on bot_configs
-- Optional structured persona info that gets injected into the system prompt
-- preamble when set, giving the bot a consistent identity without overwriting
-- the rest of the prompt.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE bot_configs
  ADD COLUMN IF NOT EXISTS persona_name         text,
  ADD COLUMN IF NOT EXISTS persona_role         text,
  ADD COLUMN IF NOT EXISTS company_description  text,
  ADD COLUMN IF NOT EXISTS company_values       text,
  ADD COLUMN IF NOT EXISTS conversation_purpose text;
