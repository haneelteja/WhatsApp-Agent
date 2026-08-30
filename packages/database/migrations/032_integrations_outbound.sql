-- ============================================================================
-- Outbound integrations — push events and data to external systems
-- ============================================================================

-- Add outbound columns to existing tenant_integrations table
ALTER TABLE tenant_integrations
  ADD COLUMN IF NOT EXISTS outbound_webhook_url    TEXT,
  ADD COLUMN IF NOT EXISTS outbound_signing_secret TEXT
    DEFAULT ('sig_' || replace(gen_random_uuid()::text, '-', '')),
  ADD COLUMN IF NOT EXISTS outbound_events         TEXT[]
    DEFAULT ARRAY['contact.created', 'conversation.resolved', 'conversation.escalated'];

-- ─── Outbound delivery log ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outbound_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type   TEXT        NOT NULL,    -- 'contact.created' | 'conversation.resolved' | 'data.export' | etc.
  status       TEXT        NOT NULL CHECK (status IN ('delivered', 'failed', 'skipped')),
  http_status  INT,                     -- HTTP status code returned by the external endpoint
  error_message TEXT,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbound_logs_tenant ON outbound_logs(tenant_id, triggered_at DESC);

ALTER TABLE outbound_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outbound_logs: read own" ON outbound_logs
  FOR SELECT USING (tenant_id = get_user_tenant_id());

GRANT ALL ON outbound_logs TO postgres, anon, authenticated, service_role;
