-- Migration 034: Lifecycle sequences
-- Time-delayed automated WhatsApp messages triggered by contact events.
-- Each row is one message step: "fire X days after trigger_event."
-- Users can create multiple sequences at different delays.

CREATE TABLE IF NOT EXISTS lifecycle_sequences (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_slug     TEXT NOT NULL,
  name             TEXT NOT NULL,
  trigger_event    TEXT NOT NULL DEFAULT 'contact_created'
                   CHECK (trigger_event IN ('contact_created', 'conversation_resolved', 'lead_created')),
  delay_days       INTEGER NOT NULL DEFAULT 3 CHECK (delay_days >= 1),
  message_template TEXT NOT NULL DEFAULT '',
  enabled          BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deduplication: one send per (sequence, contact)
CREATE TABLE IF NOT EXISTS lifecycle_sends (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  sequence_id UUID NOT NULL REFERENCES lifecycle_sequences(id) ON DELETE CASCADE,
  contact_id  UUID NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, contact_id)
);

ALTER TABLE lifecycle_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle_sends     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lifecycle_sequences_tenant_isolation"
  ON lifecycle_sequences FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY "lifecycle_sends_tenant_isolation"
  ON lifecycle_sends FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

GRANT ALL ON lifecycle_sequences TO postgres, anon, authenticated, service_role;
GRANT ALL ON lifecycle_sends     TO postgres, anon, authenticated, service_role;
