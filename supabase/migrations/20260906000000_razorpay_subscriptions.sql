-- Track Razorpay recurring subscription per tenant.
-- Plans are created in the Razorpay dashboard; IDs stored in env vars
-- (RAZORPAY_PLAN_ID_GROWTH, RAZORPAY_PLAN_ID_SCALE).

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status       TEXT
    CHECK (subscription_status IN (
      'created', 'authenticated', 'active', 'pending',
      'halted',  'cancelled',     'completed', 'expired'
    ));

CREATE INDEX IF NOT EXISTS idx_tenants_razorpay_sub_id
  ON tenants (razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;
