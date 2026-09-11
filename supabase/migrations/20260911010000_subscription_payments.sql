-- ─── Self-serve subscription payments ────────────────────────────────────────
-- Tracks Easebuzz payment links created through the /pricing self-serve flow.
-- Each row is tied to a tenant whose status starts as 'pending_payment'.
-- On successful Easebuzz callback the tenant is activated.

CREATE TABLE IF NOT EXISTS subscription_payments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan       text NOT NULL,
  amount     numeric(10,2) NOT NULL,
  status     text NOT NULL DEFAULT 'pending',  -- pending | paid | failed
  link_url   text,
  paid_at    timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_tenant_id
  ON subscription_payments (tenant_id);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_status
  ON subscription_payments (status)
  WHERE status = 'pending';
