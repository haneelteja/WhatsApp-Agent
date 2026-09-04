-- Migration 041: Lead disposition categories + conversation disposition fields.
-- Allows tenants to categorise unresponsive contacts and re-engage them later.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Disposition categories — tenant-configurable labels
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS disposition_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  color       text        NOT NULL DEFAULT '#6B7280',
  description text,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_disp_categories_tenant ON disposition_categories(tenant_id);
ALTER TABLE disposition_categories ENABLE ROW LEVEL SECURITY;
GRANT ALL ON disposition_categories TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Disposition fields on conversations
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS disposition_category_id uuid REFERENCES disposition_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disposition_notes        text,
  ADD COLUMN IF NOT EXISTS disposition_set_by       text,
  ADD COLUMN IF NOT EXISTS disposition_set_at       timestamptz;

CREATE INDEX IF NOT EXISTS idx_conv_disposition ON conversations(tenant_id, terminal_outcome)
  WHERE terminal_outcome = 'unresponsive';
