-- Migration 042: Audit log table for platform-level and per-tenant activity tracking.

CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = platform-level event
  actor_id    text,                -- platform_user.user_id or 'system'
  actor_email text,
  action      text        NOT NULL, -- e.g. 'tenant.suspended', 'bot.activated'
  entity_type text,                 -- e.g. 'tenant', 'bot', 'member'
  entity_id   text,
  description text        NOT NULL,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant    ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_platform  ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor     ON audit_logs(actor_id, created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON audit_logs TO service_role;
