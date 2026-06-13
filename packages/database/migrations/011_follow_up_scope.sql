-- ============================================================================
-- Migration 011 — Add scope + contact list to follow_up_configs
-- ============================================================================

ALTER TABLE follow_up_configs
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'all'
    CHECK (scope IN ('all', 'include', 'exclude')),
  ADD COLUMN IF NOT EXISTS contact_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN follow_up_configs.scope IS
  'all = every idle open conversation; include = only listed contacts; exclude = all except listed contacts';

COMMENT ON COLUMN follow_up_configs.contact_ids IS
  'Contact IDs used when scope = include or exclude';

GRANT ALL ON TABLE follow_up_configs TO anon, authenticated, service_role;
