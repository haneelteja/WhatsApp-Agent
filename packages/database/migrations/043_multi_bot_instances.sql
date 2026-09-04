-- ── Migration 043: Multi-instance bot support ────────────────────────────────
-- Allows tenants to run multiple instances of the same bot type (e.g. two Sales
-- Bots on different WhatsApp numbers with different KBs and personas).
--
-- Strategy:
--   • Each instance gets a unique product_slug (routing key used by the API,
--     bot_configs, and whatsapp_numbers).
--   • First/default instance: product_slug = product_type (backward-compat).
--   • Additional instances:   product_slug = '{product_type}_{6-char hex id}'.
--   • instance_name is the human-readable label shown in the UI.
--   • The old unique constraint (tenant_id, product_type) is replaced by
--     (tenant_id, product_slug).

-- 1. Add instance_name --------------------------------------------------------
ALTER TABLE tenant_products
  ADD COLUMN IF NOT EXISTS instance_name TEXT NOT NULL DEFAULT 'Default';

-- 2. Add product_slug ---------------------------------------------------------
ALTER TABLE tenant_products
  ADD COLUMN IF NOT EXISTS product_slug TEXT;

-- Backfill: existing rows use product_type as their slug (backward-compat)
UPDATE tenant_products
  SET product_slug = product_type
  WHERE product_slug IS NULL;

ALTER TABLE tenant_products
  ALTER COLUMN product_slug SET NOT NULL;

-- 3. Swap unique constraint ---------------------------------------------------
ALTER TABLE tenant_products
  DROP CONSTRAINT IF EXISTS tenant_products_tenant_id_product_type_key;

ALTER TABLE tenant_products
  ADD CONSTRAINT tenant_products_tenant_id_product_slug_key
  UNIQUE (tenant_id, product_slug);

-- 4. Index for listing all instances of a type --------------------------------
CREATE INDEX IF NOT EXISTS idx_tenant_products_type
  ON tenant_products(tenant_id, product_type, active);
