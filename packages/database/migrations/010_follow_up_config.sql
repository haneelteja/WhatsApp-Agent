-- ============================================================================
-- Migration 010 — Follow-up configuration per client per bot
-- ============================================================================

-- Per-tenant, per-product follow-up settings
CREATE TABLE IF NOT EXISTS follow_up_configs (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_slug     text NOT NULL REFERENCES products(slug),
  enabled          boolean NOT NULL DEFAULT false,
  idle_days        integer NOT NULL DEFAULT 3 CHECK (idle_days BETWEEN 1 AND 30),
  message_template text NOT NULL DEFAULT 'Hi {name}! We noticed you haven''t been in touch for a while. Is there anything we can help you with today?',
  max_follow_ups   integer NOT NULL DEFAULT 1 CHECK (max_follow_ups BETWEEN 1 AND 5),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_slug)
);

CREATE TRIGGER follow_up_configs_updated_at BEFORE UPDATE ON follow_up_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_follow_up_configs_enabled ON follow_up_configs(enabled) WHERE enabled = true;
CREATE INDEX idx_follow_up_configs_tenant  ON follow_up_configs(tenant_id);

-- Tracks each auto follow-up send — used to enforce max_follow_ups
CREATE TABLE IF NOT EXISTS follow_up_sends (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sent_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_follow_up_sends_conv ON follow_up_sends(conversation_id);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE follow_up_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_sends   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follow_up_configs: client_manager can manage own" ON follow_up_configs
  FOR ALL USING (
    tenant_id = get_user_tenant_id() AND get_user_role() = 'client_manager'
  );

CREATE POLICY "follow_up_configs: platform can manage all" ON follow_up_configs
  FOR ALL USING (is_platform_user());

CREATE POLICY "follow_up_sends: platform can read all" ON follow_up_sends
  FOR SELECT USING (is_platform_user());

CREATE POLICY "follow_up_sends: service role bypass" ON follow_up_sends
  FOR ALL USING (true);
