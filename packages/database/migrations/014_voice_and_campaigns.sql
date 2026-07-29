-- ============================================================================
-- Alphabot — Voice AI + Campaign Engine
--
-- Run AFTER 013_notification_settings.sql.
-- Adds:
--   1. voice_provider_configs  — platform-level pluggable provider registry
--   2. voice_config on bot_configs — per-bot voice settings + voicemail
--   3. voice_calls              — full call log with transcript + outcome
--   4. campaigns (extend)       — add channel, voice fields, stats
--   5. campaign_contacts        — per-contact tracking for WhatsApp/Voice/Both
-- ============================================================================

-- ─── 1. Voice provider config (platform console — manager only) ──────────────
-- One row per provider component (telephony, stt, tts).
-- Platform manager enters API keys here; bots pick defaults unless overridden.
CREATE TABLE IF NOT EXISTS voice_provider_configs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component        TEXT NOT NULL CHECK (component IN ('telephony', 'stt', 'tts')),
  provider_name    TEXT NOT NULL,   -- 'twilio' | 'exotel' | 'deepgram' | 'azure_speech' | 'sarvam' | 'google_tts' | 'twilio_say'
  display_name     TEXT NOT NULL,
  credentials_json JSONB NOT NULL DEFAULT '{}',  -- API keys / tokens (stored server-side only)
  config_json      JSONB NOT NULL DEFAULT '{}',  -- non-secret settings (voice name, region, etc.)
  is_default       BOOLEAN NOT NULL DEFAULT false,
  enabled          BOOLEAN NOT NULL DEFAULT false,  -- disabled until credentials are filled in
  estimated_cost_per_min_inr DECIMAL(8,4),         -- informational cost display in console
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (component, provider_name)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'voice_provider_configs_updated_at') THEN
    CREATE TRIGGER voice_provider_configs_updated_at
      BEFORE UPDATE ON voice_provider_configs
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- Only one default per component
CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_provider_default
  ON voice_provider_configs (component)
  WHERE is_default = true;

-- ─── Seed provider registry (all disabled until platform manager adds credentials)
INSERT INTO voice_provider_configs
  (component, provider_name, display_name, is_default, enabled, estimated_cost_per_min_inr, credentials_json, config_json)
VALUES
  -- Telephony providers
  ('telephony', 'twilio',   'Twilio Voice',         true,  false, 1.08,
   '{"account_sid": "", "auth_token": ""}',
   '{"from_number": "", "status_callback_path": "/api/voice/status", "twiml_path": "/api/voice/twiml"}'),

  ('telephony', 'exotel',   'Exotel (India — cheapest)', false, false, 0.35,
   '{"api_key": "", "api_token": "", "account_sid": ""}',
   '{"from_number": "", "app_id": ""}'),

  -- STT providers
  ('stt', 'deepgram',     'Deepgram Nova-2',          true,  false, 0.36,
   '{"api_key": ""}',
   '{"model": "nova-2", "language": "en-IN", "punctuate": true}'),

  ('stt', 'sarvam',       'Sarvam AI (India — Hindi/Regional)', false, false, 0.25,
   '{"api_key": ""}',
   '{"model": "saaras:v2", "language_code": "hi-IN"}'),

  ('stt', 'azure_speech',  'Azure Speech (India)',      false, false, 0.08,
   '{"subscription_key": ""}',
   '{"region": "centralindia", "language": "en-IN"}'),

  -- TTS providers
  ('tts', 'twilio_say',   'Twilio Say (Free — included in call)', true,  true,  0.00,
   '{}',
   '{"voice": "Polly.Aditi", "language": "hi-IN", "fallback_voice": "Polly.Raveena"}'),

  ('tts', 'google_tts',   'Google Neural2 TTS',        false, false, 0.05,
   '{"api_key": ""}',
   '{"voice_name": "en-IN-Neural2-A", "speaking_rate": 1.0}'),

  ('tts', 'sarvam_tts',   'Sarvam TTS (India — Hindi/Regional)', false, false, 0.05,
   '{"api_key": ""}',
   '{"speaker": "meera", "language_code": "hi-IN"}')

ON CONFLICT (component, provider_name) DO NOTHING;

-- ─── 2. Per-bot voice configuration ─────────────────────────────────────────
-- Added to bot_configs. Client can set voicemail message, provider preferences,
-- enable/disable voice, and choose whether to auto-dispatch on escalation.
ALTER TABLE bot_configs
  ADD COLUMN IF NOT EXISTS voice_config JSONB NOT NULL DEFAULT '{
    "enabled": false,
    "telephony_provider": null,
    "stt_provider": null,
    "tts_provider": null,
    "language": "en-IN",
    "tts_voice": null,
    "voicemail_enabled": true,
    "voicemail_message": "Hi, this is an automated message from our support team. We were unable to connect with you. Please WhatsApp us and we will get back to you shortly.",
    "max_call_duration_seconds": 300,
    "max_turns": 20,
    "silence_timeout_seconds": 5,
    "auto_dispatch_on_escalation": false,
    "escalation_voice_delay_seconds": 0,
    "greeting_message": null
  }';

-- ─── 3. Voice calls log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_calls (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id      UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id           UUID REFERENCES contacts(id) ON DELETE SET NULL,
  campaign_id          UUID,   -- FK added after campaigns table extension

  direction            TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number          TEXT NOT NULL,   -- our number
  to_number            TEXT NOT NULL,   -- customer number
  product_slug         TEXT REFERENCES products(slug),

  telephony_provider   TEXT NOT NULL DEFAULT 'twilio',
  telephony_call_sid   TEXT,           -- Twilio CallSid / Exotel CallSid
  stt_provider         TEXT NOT NULL DEFAULT 'deepgram',
  tts_provider         TEXT NOT NULL DEFAULT 'twilio_say',

  status               TEXT NOT NULL DEFAULT 'initiated'
                         CHECK (status IN ('initiated', 'ringing', 'in_progress', 'completed', 'failed', 'no_answer', 'voicemail', 'busy')),

  duration_seconds     INTEGER,
  turn_count           INTEGER NOT NULL DEFAULT 0,
  recording_url        TEXT,
  transcript           TEXT,           -- full conversation text (CALLER: ... BOT: ...)

  -- Structured outcome extracted by Claude after call ends
  outcome_json         JSONB,          -- {intent, product_interest, resolved, escalation_needed, sentiment, follow_up_action, summary}

  triggered_by         TEXT NOT NULL DEFAULT 'manual'
                         CHECK (triggered_by IN ('escalation', 'campaign', 'manual', 'inbound')),

  cost_rupees          DECIMAL(10, 4), -- calculated after call ends from provider rates
  error_message        TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'voice_calls_updated_at') THEN
    CREATE TRIGGER voice_calls_updated_at
      BEFORE UPDATE ON voice_calls
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_voice_calls_tenant       ON voice_calls(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_calls_conversation  ON voice_calls(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voice_calls_campaign      ON voice_calls(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voice_calls_status        ON voice_calls(status);
CREATE INDEX IF NOT EXISTS idx_voice_calls_call_sid      ON voice_calls(telephony_call_sid) WHERE telephony_call_sid IS NOT NULL;

-- ─── 4. Extend campaigns table ───────────────────────────────────────────────
-- The campaigns table may already exist with basic columns.
-- All additions are safe ADD COLUMN IF NOT EXISTS.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS channel      TEXT NOT NULL DEFAULT 'whatsapp'
    CHECK (channel IN ('whatsapp', 'voice', 'both')),
  ADD COLUMN IF NOT EXISTS product_slug TEXT REFERENCES products(slug),
  ADD COLUMN IF NOT EXISTS contact_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS message_template TEXT,  -- WhatsApp message body
  ADD COLUMN IF NOT EXISTS voice_script TEXT,       -- context passed as call_context to voice agent
  ADD COLUMN IF NOT EXISTS schedule_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timezone     TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS retry_config JSONB NOT NULL DEFAULT '{
    "auto_retry": true,
    "retry_limit": 2,
    "retry_after_hours": 4,
    "voice_after_wa_hours": 2
  }',
  ADD COLUMN IF NOT EXISTS both_config  JSONB DEFAULT '{
    "whatsapp_first": true,
    "dispatch_voice_if_no_reply_hours": 2
  }',
  ADD COLUMN IF NOT EXISTS stats        JSONB NOT NULL DEFAULT '{
    "total": 0,
    "wa_sent": 0, "wa_replied": 0, "wa_failed": 0,
    "calls_made": 0, "calls_answered": 0, "calls_voicemail": 0, "calls_failed": 0
  }',
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT now();

-- ─── 5. Campaign contacts (per-contact status tracking) ──────────────────────
CREATE TABLE IF NOT EXISTS campaign_contacts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  phone_number     TEXT NOT NULL,
  customer_name    TEXT,
  extra_data       JSONB NOT NULL DEFAULT '{}',  -- {product_interest, language, ...}

  whatsapp_status  TEXT NOT NULL DEFAULT 'pending'
                     CHECK (whatsapp_status IN ('pending', 'sent', 'replied', 'failed', 'skipped')),
  voice_status     TEXT NOT NULL DEFAULT 'pending'
                     CHECK (voice_status IN ('pending', 'initiated', 'answered', 'voicemail', 'failed', 'no_answer', 'skipped')),

  voice_call_id    UUID REFERENCES voice_calls(id) ON DELETE SET NULL,
  outcome_json     JSONB,   -- from voice_call.outcome_json once call is done
  attempts         INTEGER NOT NULL DEFAULT 0,
  last_attempt_at  TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign ON campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_pending
  ON campaign_contacts(campaign_id, voice_status, whatsapp_status)
  WHERE voice_status = 'pending' OR whatsapp_status = 'pending';

-- Back-reference: add campaign_id FK to voice_calls now that campaigns is defined
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_voice_calls_campaign'
  ) THEN
    ALTER TABLE voice_calls
      ADD CONSTRAINT fk_voice_calls_campaign
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 6. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE voice_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_calls            ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_contacts      ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'voice_provider_configs: authenticated read') THEN
    CREATE POLICY "voice_provider_configs: authenticated read"
      ON voice_provider_configs FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'voice_provider_configs: platform manager write') THEN
    CREATE POLICY "voice_provider_configs: platform manager write"
      ON voice_provider_configs FOR ALL
      USING (get_platform_role() = 'manager');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'voice_calls: tenant reads own') THEN
    CREATE POLICY "voice_calls: tenant reads own"
      ON voice_calls FOR SELECT
      USING (tenant_id IN (
        SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'voice_calls: platform reads all') THEN
    CREATE POLICY "voice_calls: platform reads all"
      ON voice_calls FOR SELECT
      USING (is_platform_user());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'voice_calls: service role all') THEN
    CREATE POLICY "voice_calls: service role all"
      ON voice_calls FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'campaign_contacts: tenant reads own') THEN
    CREATE POLICY "campaign_contacts: tenant reads own"
      ON campaign_contacts FOR SELECT
      USING (tenant_id IN (
        SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'campaign_contacts: service role all') THEN
    CREATE POLICY "campaign_contacts: service role all"
      ON campaign_contacts FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
