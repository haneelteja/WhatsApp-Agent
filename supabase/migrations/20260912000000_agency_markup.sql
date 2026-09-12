-- ─── Agency Markup Configuration ─────────────────────────────────────────────
-- Stores per-plan markup percentages set by an agency tenant.
-- Used to calculate "client charge" (base Alphabot price + markup) on the
-- Agency Billing dashboard.

CREATE TABLE IF NOT EXISTS agency_markup_config (
  agency_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan            text        NOT NULL,
  markup_percent  numeric(5,2) NOT NULL DEFAULT 0 CHECK (markup_percent >= 0 AND markup_percent <= 500),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agency_id, plan)
);

CREATE INDEX IF NOT EXISTS idx_agency_markup_config_agency_id
  ON agency_markup_config (agency_id);
