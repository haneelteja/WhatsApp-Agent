-- Interactive button templates for WhatsApp quick-reply / list / CTA-URL messages.
-- Platform managers define templates here; the AI pipeline references them by name.

CREATE TABLE IF NOT EXISTS interactive_button_templates (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- null = applies to all bots for this tenant
  product_slug     text        REFERENCES products(slug) ON DELETE CASCADE,
  -- Short slug the AI uses in [BUTTONS:name] marker (e.g. "product_interest")
  name             text        NOT NULL,
  description      text,
  type             text        NOT NULL CHECK (type IN ('quick_reply', 'list', 'cta_url')),
  -- Payload shape per type:
  --   quick_reply: { body, buttons: [{id, title}] }
  --   list:        { body, button_label, sections: [{title, rows: [{id, title, description?}]}] }
  --   cta_url:     { body, button_text, url }
  template_json    jsonb       NOT NULL,
  -- Rule-based: auto-send this template when the user message contains any of these words
  trigger_keywords text[]      NOT NULL DEFAULT '{}',
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER interactive_button_templates_updated_at
  BEFORE UPDATE ON interactive_button_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Index for the per-tenant listing query used in the webhook pipeline
CREATE INDEX IF NOT EXISTS idx_ibt_tenant_active
  ON interactive_button_templates (tenant_id, product_slug, is_active);

-- RLS: service role (API) bypasses; users see only their tenant's templates
ALTER TABLE interactive_button_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON interactive_button_templates
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );
