-- ============================================================================
-- Contact groups / segmentation
--
-- Clients define named groups (e.g. "VIP", "Hot Leads", "Discount Seekers").
-- Contacts can belong to multiple groups.
-- AI can suggest a group based on sentiment and conversation history.
-- Groups are used as audiences for campaigns and bulk messaging.
-- ============================================================================

CREATE TABLE IF NOT EXISTS contact_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT NOT NULL DEFAULT '#10b981',
  emoji       TEXT NOT NULL DEFAULT '👥',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'contact_groups_updated_at') THEN
    CREATE TRIGGER contact_groups_updated_at
      BEFORE UPDATE ON contact_groups
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contact_groups_tenant ON contact_groups(tenant_id);

-- RLS
ALTER TABLE contact_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contact_groups: read own" ON contact_groups
  FOR SELECT USING (tenant_id = get_user_tenant_id());

-- ─── Members ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contact_group_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  added_by   TEXT NOT NULL DEFAULT 'manual' CHECK (added_by IN ('manual', 'ai')),
  ai_reason  TEXT,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_cgm_group   ON contact_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_cgm_contact ON contact_group_members(contact_id);
CREATE INDEX IF NOT EXISTS idx_cgm_tenant  ON contact_group_members(tenant_id);

ALTER TABLE contact_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contact_group_members: read own" ON contact_group_members
  FOR SELECT USING (tenant_id = get_user_tenant_id());

GRANT ALL ON contact_groups        TO postgres, anon, authenticated, service_role;
GRANT ALL ON contact_group_members TO postgres, anon, authenticated, service_role;
