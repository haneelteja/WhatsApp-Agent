-- Link each conversation to the WhatsApp number it arrived on.
-- Enables per-number filtering in the Agent Inbox.
-- Nullable: existing conversations (pre-migration) and legacy-URL webhooks have no number reference.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS whatsapp_number_id UUID
    REFERENCES whatsapp_numbers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_whatsapp_number
  ON conversations (tenant_id, whatsapp_number_id)
  WHERE whatsapp_number_id IS NOT NULL;
