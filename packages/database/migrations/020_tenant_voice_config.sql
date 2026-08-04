-- ============================================================================
-- Per-tenant voice configuration
--
-- Separates "from_number" (client's caller ID) from platform-level credentials,
-- and adds monthly/daily usage limits with rolling counters.
--
-- Architecture:
--   Platform Console  → voice_provider_configs: Exotel API keys, platform from_number (fallback)
--   THIS TABLE        → tenant_voice_configs:   per-client from_number + limits + usage
--   Bot Config        → bot_configs.voice_config: provider choice, greeting, language
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_voice_configs (
  tenant_id              UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

  -- Client's outbound caller ID (their Exotel/Twilio number, e.g. '+918040000000')
  -- Overrides the platform-level from_number in voice_provider_configs.config_json.
  from_number            TEXT NOT NULL DEFAULT '',

  -- Usage limits (NULL = unlimited)
  max_calls_per_month    INTEGER,
  max_minutes_per_month  INTEGER,
  max_calls_per_day      INTEGER,
  max_cost_inr_per_month DECIMAL(10,2),

  -- Rolling usage counters — reset automatically in application code
  calls_this_month       INTEGER        NOT NULL DEFAULT 0,
  minutes_this_month     DECIMAL(10,2)  NOT NULL DEFAULT 0,
  cost_inr_this_month    DECIMAL(10,2)  NOT NULL DEFAULT 0,
  calls_today            INTEGER        NOT NULL DEFAULT 0,

  -- Reset-tracking dates (YYYY-MM-DD). When current date exceeds these,
  -- the application resets the corresponding counters.
  monthly_reset_at       DATE           NOT NULL DEFAULT CURRENT_DATE,
  daily_reset_at         DATE           NOT NULL DEFAULT CURRENT_DATE,

  created_at             TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- updated_at trigger
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tenant_voice_configs_updated_at') THEN
    CREATE TRIGGER tenant_voice_configs_updated_at
      BEFORE UPDATE ON tenant_voice_configs
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- RLS: clients can read their own row; only service-role (platform) can write
ALTER TABLE tenant_voice_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_voice_configs: read own" ON tenant_voice_configs
  FOR SELECT USING (tenant_id = get_user_tenant_id());
