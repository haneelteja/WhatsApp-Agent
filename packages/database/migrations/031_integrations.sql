-- ============================================================================
-- External integrations — CRM / campaign webhook
--
-- Each tenant gets one row in tenant_integrations with a unique API key.
-- Inbound webhook hits are logged in webhook_logs for observability.
-- ============================================================================

-- ─── Integration settings (one per tenant) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_integrations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  webhook_api_key  TEXT        NOT NULL UNIQUE DEFAULT ('wh_' || replace(gen_random_uuid()::text, '-', '')),
  welcome_template TEXT        NOT NULL DEFAULT 'Hi {name}! 👋 Thanks for reaching out. We''re excited to connect with you! How can we help you today?',
  enabled          BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tenant_integrations_updated_at') THEN
    CREATE TRIGGER tenant_integrations_updated_at
      BEFORE UPDATE ON tenant_integrations
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ─── Webhook hit log ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_phone TEXT        NOT NULL,
  contact_name  TEXT,
  status        TEXT        NOT NULL CHECK (status IN ('sent', 'failed', 'duplicate', 'skipped')),
  error_message TEXT,
  source        TEXT,       -- 'hubspot' | 'zapier' | 'make' | 'api' | etc.
  triggered_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_tenant      ON webhook_logs(tenant_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_phone       ON webhook_logs(tenant_id, contact_phone);

ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_integrations: read own" ON tenant_integrations
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "webhook_logs: read own" ON webhook_logs
  FOR SELECT USING (tenant_id = get_user_tenant_id());

GRANT ALL ON tenant_integrations TO postgres, anon, authenticated, service_role;
GRANT ALL ON webhook_logs        TO postgres, anon, authenticated, service_role;
