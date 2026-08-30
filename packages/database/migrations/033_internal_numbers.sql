-- Migration 033: Internal team phone numbers
-- Messages from these numbers are silently ignored by the bot.

CREATE TABLE IF NOT EXISTS tenant_internal_numbers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone      TEXT NOT NULL,
  label      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)
);

ALTER TABLE tenant_internal_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_internal_numbers_tenant_isolation"
  ON tenant_internal_numbers
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

GRANT ALL ON tenant_internal_numbers TO postgres, anon, authenticated, service_role;
