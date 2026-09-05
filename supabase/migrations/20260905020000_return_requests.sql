-- Return / replacement requests raised by customers via WhatsApp.
-- Created automatically when the lifecycle bot detects a return/replacement intent.

CREATE TABLE IF NOT EXISTS return_requests (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID         REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id      UUID         NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  order_id        UUID         REFERENCES orders(id) ON DELETE SET NULL,
  type            TEXT         NOT NULL DEFAULT 'return'
                               CHECK (type IN ('return', 'replacement')),
  reason          TEXT,
  status          TEXT         NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  staff_notes     TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_return_requests_tenant_status
  ON return_requests (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_return_requests_contact
  ON return_requests (contact_id);

ALTER TABLE return_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "return_requests_tenant_isolation"
  ON return_requests FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

GRANT ALL ON return_requests TO postgres, anon, authenticated, service_role;
