-- Audit log table for tracking all platform and client-level actions.
-- Uses CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS so it's safe
-- to run even if the table was created manually before this migration.

CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        REFERENCES tenants(id) ON DELETE SET NULL,
  actor_id     TEXT,       -- auth.users UUID as text, or 'system' for automated jobs
  actor_email  TEXT,
  action       TEXT        NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  description  TEXT        NOT NULL,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add any columns that may be missing if the table was created manually
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_email  TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type  TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id    TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata     JSONB;

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
  ON audit_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON audit_logs (action);

-- RLS: platform uses admin client (bypasses RLS); client dashboard reads
-- via admin client too, so RLS doesn't need to gate reads. Enable anyway
-- so direct Supabase client access is scoped correctly if ever used.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only the service role (admin client) can write
CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT WITH CHECK (false); -- blocked for anon/authenticated; admin client bypasses

-- Tenants can read their own logs via tenant_users
CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );
