-- Migration 039: Suppression registry, conversation outcomes, message kind classifier,
-- rolling chat summary, and prompt variant attribution.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Opt-out suppression table (append-only, never deleted from)
--    Checked before every campaign send and at the top of every inbound handler.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_suppressions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_e164   text        NOT NULL,
  reason       text        NOT NULL DEFAULT 'user_opt_out'
    CHECK (reason IN ('user_opt_out','meta_complaint','undeliverable','manual','regulatory')),
  suppressed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone_e164)
);
CREATE INDEX IF NOT EXISTS idx_suppressions_lookup
  ON contact_suppressions(tenant_id, phone_e164);
ALTER TABLE contact_suppressions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON contact_suppressions TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Granular conversation outcome taxonomy
--    terminal_outcome captures WHY a conversation closed (9 options).
--    outcome_set_by distinguishes AI auto-classification from human override.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS terminal_outcome text
    CHECK (terminal_outcome IN (
      'converted','not_interested','wrong_fit',
      'no_budget','has_solution','bad_timing',
      'unresponsive','opted_out','undeliverable'
    )),
  ADD COLUMN IF NOT EXISTS outcome_set_by text
    CHECK (outcome_set_by IN ('ai','human','system')),
  ADD COLUMN IF NOT EXISTS outcome_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_summary    jsonb DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_conversations_terminal_outcome
  ON conversations(tenant_id, terminal_outcome)
  WHERE terminal_outcome IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Message kind classifier with versioned replay
--    Every inbound message is classified into a kind.
--    kind_classifier_version allows re-running classification when logic improves.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS message_kind              text
    CHECK (message_kind IN (
      'human_reply','auto_reply','opt_out',
      'template_feedback','system','unrelated','outbound'
    )),
  ADD COLUMN IF NOT EXISTS kind_classifier_version   smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS kind_classified_at        timestamptz,
  ADD COLUMN IF NOT EXISTS system_prompt_digest      text;  -- sha256 of base system prompt (outbound only)

-- Index for re-classification sweeps when version bumps
CREATE INDEX IF NOT EXISTS idx_messages_classifier_version
  ON messages(kind_classifier_version, role)
  WHERE role = 'user';

-- Index for prompt A/B analysis
CREATE INDEX IF NOT EXISTS idx_messages_prompt_digest
  ON messages(system_prompt_digest)
  WHERE system_prompt_digest IS NOT NULL;
