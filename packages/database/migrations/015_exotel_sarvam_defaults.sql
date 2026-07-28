-- ============================================================================
-- Alphabot — Set Exotel + Sarvam + ExotelSay as platform defaults
--
-- Run AFTER 014_voice_and_campaigns.sql.
-- Target cost: ~₹1.07/min  (Exotel ₹0.35 + Sarvam STT ₹0.25 + Haiku ₹0.42 + ExotelSay free)
--
-- Twilio + Deepgram remain seeded but non-default (can be selected per-bot).
-- ============================================================================

-- ─── 1. Add ExotelSay TTS provider ───────────────────────────────────────────
INSERT INTO voice_provider_configs
  (component, provider_name, display_name, is_default, enabled, estimated_cost_per_min_inr, credentials_json, config_json)
VALUES
  ('tts', 'exotel_say', 'Exotel Say (Free — included in call)', false, true, 0.00,
   '{}',
   '{"voice": "Polly.Aditi", "language": "hi-IN"}')
ON CONFLICT (component, provider_name) DO NOTHING;

-- ─── 2. Swap telephony default: Twilio → Exotel ───────────────────────────────
-- Must clear old default first (unique index enforces one default per component)
UPDATE voice_provider_configs
  SET is_default = false
  WHERE component = 'telephony' AND provider_name = 'twilio';

UPDATE voice_provider_configs
  SET is_default = true
  WHERE component = 'telephony' AND provider_name = 'exotel';

-- ─── 3. Swap STT default: Deepgram → Sarvam ──────────────────────────────────
UPDATE voice_provider_configs
  SET is_default = false
  WHERE component = 'stt' AND provider_name = 'deepgram';

UPDATE voice_provider_configs
  SET is_default = true
  WHERE component = 'stt' AND provider_name = 'sarvam';

-- ─── 4. Swap TTS default: TwilioSay → ExotelSay ─────────────────────────────
UPDATE voice_provider_configs
  SET is_default = false
  WHERE component = 'tts' AND provider_name = 'twilio_say';

UPDATE voice_provider_configs
  SET is_default = true
  WHERE component = 'tts' AND provider_name = 'exotel_say';

-- ─── 5. Keep TwilioSay enabled (still usable when Twilio is telephony provider)
-- Exotel+Sarvam default providers are set to disabled until platform manager
-- enters API credentials via Platform Console → Voice Settings.
-- (enabled=true only once credentials are added — done via PUT /api/voice/providers/:id)
