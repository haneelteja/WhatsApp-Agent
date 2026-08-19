-- ── Sales Bot CRM Enhancements ───────────────────────────────────────────────
-- Task 2: Lead Scoring
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_follow_up_count INTEGER NOT NULL DEFAULT 0;

-- Task 3: Warm Handoff Summary
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS ai_summary TEXT;

-- Task 4: CRM Lead Notes
CREATE TABLE IF NOT EXISTS lead_notes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tenant_id       UUID        NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  author_name     TEXT,
  note            TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_notes_conversation ON lead_notes(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_notes_tenant       ON lead_notes(tenant_id, created_at DESC);

-- Task 5: Sales bot follow-up config
ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS sales_config JSONB NOT NULL DEFAULT '{}';
