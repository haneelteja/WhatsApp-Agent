-- ─── Agency / Reseller Support ────────────────────────────────────────────────
-- Adds two columns to tenants:
--   is_agency        — marks a tenant as a reseller who manages sub-clients
--   parent_tenant_id — links a sub-client back to its agency tenant

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS is_agency boolean NOT NULL DEFAULT false;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS parent_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_parent_tenant_id
  ON tenants (parent_tenant_id)
  WHERE parent_tenant_id IS NOT NULL;

-- RLS: agencies can read their own sub-clients
-- (platform already has admin-level access so no additional policy needed there)
