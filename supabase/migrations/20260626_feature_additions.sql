-- ─── Alphabot Feature Additions Migration ────────────────────────────────────
-- Run this in your Supabase SQL editor or via `supabase db push`.
-- All changes are additive (no destructive ALTER / DROP).

-- ─── 1. messages: delivery status + ensure whatsapp_msg_id is indexed ────────

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS delivery_status TEXT
    CHECK (delivery_status IN ('sent', 'delivered', 'read', 'failed'));

-- Index so the status-ladder UPDATE (WHERE whatsapp_msg_id = $1) is fast
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_msg_id
  ON messages (whatsapp_msg_id)
  WHERE whatsapp_msg_id IS NOT NULL;

-- ─── 2. conversations: optimistic lock + escalation policy counters ───────────

-- Optimistic AI processing lock (NULL = unlocked; future ISO-8601 = locked until)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS processing_lock_expires_at TIMESTAMPTZ DEFAULT NULL;

-- Counts consecutive low-confidence AI turns; resets on confident reply
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS low_confidence_count INTEGER NOT NULL DEFAULT 0;

-- AI conversation state machine stage
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'greeting'
    CHECK (stage IN ('greeting', 'qualifying', 'resolving', 'following_up', 'closing'));

-- AI-extracted entities accumulated across turns (name, email, order_id, etc.)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_vars JSONB NOT NULL DEFAULT '{}'::JSONB;

-- Index to efficiently find stuck locks for cleanup (optional background job)
CREATE INDEX IF NOT EXISTS idx_conversations_lock_expires
  ON conversations (processing_lock_expires_at)
  WHERE processing_lock_expires_at IS NOT NULL;

-- ─── 3. bot_configs: per-bot escalation policy ───────────────────────────────

-- NULL = use platform defaults (confidence_threshold = 0.6, max 2 reprompts, escalate on exhaust)
ALTER TABLE bot_configs
  ADD COLUMN IF NOT EXISTS escalation_policy JSONB DEFAULT NULL;

-- Example valid value:
-- {
--   "confidence_threshold": 0.55,
--   "max_low_confidence_reprompts": 3,
--   "on_exhaust": "escalate",
--   "reprompt_message": "I want to make sure I'm helping you correctly. Could you rephrase your question?",
--   "auto_escalate_after_hours": 24
-- }

-- ─── 4. Auto-expire stale locks (runs as a Supabase pg_cron job) ─────────────
-- Uncomment and adjust if you have pg_cron enabled:
--
-- SELECT cron.schedule(
--   'clear-stale-ai-locks',
--   '*/5 * * * *',   -- every 5 minutes
--   $$
--     UPDATE conversations
--        SET processing_lock_expires_at = NULL
--      WHERE processing_lock_expires_at < NOW() - INTERVAL '5 minutes';
--   $$
-- );
