-- Ensure tenant_internal_numbers exists with all expected columns.
-- The table may have been created manually without label or created_at,
-- which causes listInternalNumbers() to silently return [] in the UI.

CREATE TABLE IF NOT EXISTS tenant_internal_numbers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone      TEXT        NOT NULL,
  label      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, phone)
);

-- Safe to re-run — adds columns that may be missing on manually-created tables
ALTER TABLE tenant_internal_numbers ADD COLUMN IF NOT EXISTS label      TEXT;
ALTER TABLE tenant_internal_numbers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_tenant_internal_numbers_tenant
  ON tenant_internal_numbers (tenant_id);

ALTER TABLE tenant_internal_numbers ENABLE ROW LEVEL SECURITY;

-- Tenants can manage their own internal numbers via the admin client (bypasses RLS).
-- Direct authenticated access: only members of the tenant can read/write.
DROP POLICY IF EXISTS tenant_internal_numbers_select ON tenant_internal_numbers;
CREATE POLICY tenant_internal_numbers_select ON tenant_internal_numbers
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tenant_internal_numbers_insert ON tenant_internal_numbers;
CREATE POLICY tenant_internal_numbers_insert ON tenant_internal_numbers
  FOR INSERT WITH CHECK (false); -- admin client only

DROP POLICY IF EXISTS tenant_internal_numbers_delete ON tenant_internal_numbers;
CREATE POLICY tenant_internal_numbers_delete ON tenant_internal_numbers
  FOR DELETE USING (false); -- admin client only
