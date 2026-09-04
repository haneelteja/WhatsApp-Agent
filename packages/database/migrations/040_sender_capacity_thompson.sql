-- Migration 040: WhatsApp sender capacity / spacing clock, confidence-gated escalation,
-- Thompson sampling for campaign contact selection, and qualifier fingerprinting.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. WhatsApp sender capacity / spacing clock
--    One row per phone number. next_send_at is the spacing clock — updated after
--    every campaign send. messages_sent_today is reset nightly by a cron job.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wa_sender_capacity (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number_id      text        NOT NULL,   -- Meta WABA phone_number_id
  daily_limit          integer     NOT NULL DEFAULT 250,
  messages_sent_today  integer     NOT NULL DEFAULT 0,
  limit_source         text        NOT NULL DEFAULT 'configured'
    CHECK (limit_source IN ('configured','meta_tier','measured')),
  next_send_at         timestamptz,
  paused_today         boolean     NOT NULL DEFAULT false,
  last_reset_at        date        NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (tenant_id, phone_number_id)
);
CREATE INDEX IF NOT EXISTS idx_sender_capacity_lookup
  ON wa_sender_capacity(tenant_id, phone_number_id);
ALTER TABLE wa_sender_capacity ENABLE ROW LEVEL SECURITY;
GRANT ALL ON wa_sender_capacity TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Confidence-gated escalation thresholds on bot_configs
--    Escalation only triggers when lead_score >= escalation_score_threshold.
--    This prevents flooding human agents with low-quality leads.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE bot_configs
  ADD COLUMN IF NOT EXISTS escalation_score_threshold  integer NOT NULL DEFAULT 40
    CHECK (escalation_score_threshold BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS catalogue_score_threshold   integer NOT NULL DEFAULT 25
    CHECK (catalogue_score_threshold BETWEEN 0 AND 100);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Thompson sampling columns on campaign_contacts
--    ts_alpha = successful outcomes (converted, replied); ts_beta = non-successes.
--    Initialised to (1,1) = uniform prior. Selection uses Beta(alpha,beta) sample.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE campaign_contacts
  ADD COLUMN IF NOT EXISTS ts_alpha float NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS ts_beta  float NOT NULL DEFAULT 1.0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Qualifier fingerprinting — scorer state cache
--    One row per (tenant, bot). evidence_fingerprint is sha256 of all outcome
--    verdicts — if unchanged, model_params is served from cache.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_scorer_state (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_slug         text        NOT NULL,
  evidence_fingerprint text        NOT NULL,   -- sha256 of serialised training verdicts
  model_params         jsonb       NOT NULL DEFAULT '{}',
  trained_at           timestamptz NOT NULL DEFAULT now(),
  sample_count         integer     NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, product_slug)
);
ALTER TABLE bot_scorer_state ENABLE ROW LEVEL SECURITY;
GRANT ALL ON bot_scorer_state TO service_role;
