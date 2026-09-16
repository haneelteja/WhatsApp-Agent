-- Multi-bot per number routing
-- Adds routing_mode and routing_config to whatsapp_numbers so a single
-- phone number can route conversations to different bots based on intent.

ALTER TABLE whatsapp_numbers
  ADD COLUMN IF NOT EXISTS routing_mode text NOT NULL DEFAULT 'single'
    CHECK (routing_mode IN ('single', 'multi')),
  ADD COLUMN IF NOT EXISTS routing_config jsonb;

COMMENT ON COLUMN whatsapp_numbers.routing_mode IS 'single = always route to product_slug; multi = intent-based routing';
COMMENT ON COLUMN whatsapp_numbers.routing_config IS 'JSON: { greeting, general_question, menu_intro, confidence_threshold, menu_labels }';
