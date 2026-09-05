-- Lifecycle Bot enhancements:
--   1. invoices table — for PDF invoices generated per order
--   2. payment reminder tracking columns on orders
--   3. order_delivered trigger event on lifecycle_sequences

-- ── 1. Invoices ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id       UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  invoice_number TEXT         NOT NULL,
  pdf_url        TEXT,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices (order_id);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_tenant_isolation"
  ON invoices FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

GRANT ALL ON invoices TO postgres, anon, authenticated, service_role;

-- ── 2. Payment reminder tracking ─────────────────────────────────────────────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS reminder_count    INTEGER    NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_reminded_at  TIMESTAMPTZ;

-- ── 3. order_delivered lifecycle trigger ─────────────────────────────────────

ALTER TABLE lifecycle_sequences
  DROP CONSTRAINT IF EXISTS lifecycle_sequences_trigger_event_check;

ALTER TABLE lifecycle_sequences
  ADD CONSTRAINT lifecycle_sequences_trigger_event_check
  CHECK (trigger_event IN (
    'contact_created',
    'conversation_resolved',
    'lead_created',
    'order_delivered'
  ));
