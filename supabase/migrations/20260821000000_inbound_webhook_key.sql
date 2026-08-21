-- Add per-tenant inbound webhook key for Zapier / Make lead ingestion
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS inbound_webhook_key UUID DEFAULT NULL;

-- Unique index so we can look up tenant by key efficiently
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_inbound_webhook_key
  ON tenants (inbound_webhook_key)
  WHERE inbound_webhook_key IS NOT NULL;
