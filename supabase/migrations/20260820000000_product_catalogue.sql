-- Product catalogue for the sales bot.
-- Active products are injected into the bot's system prompt so it can quote
-- exact prices and trigger a formatted WhatsApp product list on demand.

CREATE TABLE IF NOT EXISTS product_catalogue (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  price_inr   NUMERIC(12, 2),
  category    TEXT,
  sku         TEXT,
  image_url   TEXT,
  active      BOOLEAN     NOT NULL DEFAULT true,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Covers the API cache fetch: active products for a tenant, ordered by sort_order then name
CREATE INDEX IF NOT EXISTS idx_product_catalogue_tenant
  ON product_catalogue (tenant_id, active, sort_order, name);
