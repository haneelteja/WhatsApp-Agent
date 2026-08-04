-- ============================================================================
-- Per-tenant Exotel credentials
--
-- Extends tenant_voice_configs so each client can configure their own
-- Exotel account. When present, their bot uses THEIR credentials and numbers
-- exclusively. Falls back to platform voice_provider_configs if absent.
-- ============================================================================

ALTER TABLE tenant_voice_configs
  ADD COLUMN IF NOT EXISTS exotel_api_key     TEXT,
  ADD COLUMN IF NOT EXISTS exotel_api_token   TEXT,
  ADD COLUMN IF NOT EXISTS exotel_account_sid TEXT;
