-- ── KB hit log ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kb_hit_log (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entry_id      UUID          REFERENCES knowledge_base(id) ON DELETE SET NULL,
  query         TEXT          NOT NULL,
  product_type  TEXT,
  score         REAL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_hit_log_tenant_created
  ON kb_hit_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kb_hit_log_entry_tenant
  ON kb_hit_log (entry_id, tenant_id)
  WHERE entry_id IS NOT NULL;

-- ── KB unanswered queries ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kb_unanswered_queries (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  query         TEXT          NOT NULL,
  product_type  TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_unanswered_tenant_created
  ON kb_unanswered_queries (tenant_id, created_at DESC);

-- ── Per-user notification preferences ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id          UUID          NOT NULL,
  tenant_id        UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  escalation_email BOOLEAN       NOT NULL DEFAULT true,
  assignment_email BOOLEAN       NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_notif_prefs_tenant
  ON user_notification_preferences (tenant_id);

-- ── Plan renewal tracking ────────────────────────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_expires_at        TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS renewal_7d_reminded_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS renewal_3d_reminded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenants_plan_expires_at
  ON tenants (plan_expires_at)
  WHERE plan_expires_at IS NOT NULL;
