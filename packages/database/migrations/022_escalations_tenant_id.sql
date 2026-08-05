-- Migration 022: Add tenant_id to escalations for efficient per-tenant queries.
-- Previously the table had no tenant_id column, forcing a full-table scan
-- filtered in application code (cross-tenant data leak risk + O(all-tenants) queries).

ALTER TABLE escalations
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Backfill from the joined conversation
UPDATE escalations e
SET    tenant_id = c.tenant_id
FROM   conversations c
WHERE  e.conversation_id = c.id
  AND  e.tenant_id IS NULL;

-- After backfill, enforce NOT NULL
ALTER TABLE escalations
  ALTER COLUMN tenant_id SET NOT NULL;

-- Partial index: only pending/assigned escalations are queried by the dashboard
CREATE INDEX IF NOT EXISTS idx_escalations_tenant_status
  ON escalations (tenant_id, status)
  WHERE status IN ('pending', 'assigned');

-- Full index for general tenant-scoped queries (history, reports)
CREATE INDEX IF NOT EXISTS idx_escalations_tenant_created
  ON escalations (tenant_id, created_at DESC);
