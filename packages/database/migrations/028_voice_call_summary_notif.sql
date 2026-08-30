-- ============================================================================
-- Call summary notifications per tenant
--
-- After each voice call completes, send a WhatsApp summary to configured
-- internal team numbers. Stored on tenant_voice_configs.
-- ============================================================================

ALTER TABLE tenant_voice_configs
  ADD COLUMN IF NOT EXISTS call_summary_enabled     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS call_summary_wa_numbers  TEXT[]  NOT NULL DEFAULT '{}';
