-- Migration 038: Intent signals (explainable lead scoring) + tool manifest per bot

-- ─────────────────────────────────────────────────────────────────────────────
-- Intent signals on conversations
-- The AI emits [SIGNAL:x] markers that are extracted and persisted alongside
-- the existing lead_score, giving operators explainable reasons for scores.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS intent_signals   text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS intent_reasoning text;

-- Fast lookup: "show me all leads with pricing_inquiry signal"
CREATE INDEX IF NOT EXISTS idx_conversations_intent_signals
  ON conversations USING GIN (intent_signals);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tool manifest on bot_configs
-- Declares which platform tools are active for a given bot. Controls both
-- what prompt instructions are injected AND what capabilities are invoked
-- at runtime (KB lookup, catalogue, buttons, lead scoring, follow-up, etc.)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE bot_configs
  ADD COLUMN IF NOT EXISTS allowed_tools text[] NOT NULL DEFAULT
    '{"knowledge_base","product_catalogue","button_templates","lead_scoring","contact_memory"}';

-- ─────────────────────────────────────────────────────────────────────────────
-- Campaign status transition log
-- Immutable audit trail for every status change on a campaign.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_status_transitions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  tenant_id   uuid        NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  from_status text,
  to_status   text        NOT NULL,
  actor_id    uuid,                    -- auth.users.id who triggered the change
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cst_campaign
  ON campaign_status_transitions(campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cst_tenant
  ON campaign_status_transitions(tenant_id, created_at DESC);

ALTER TABLE campaign_status_transitions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON campaign_status_transitions TO service_role;
