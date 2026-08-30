-- ============================================================================
-- Voice working hours + timezone per tenant
--
-- Adds three columns to tenant_voice_configs:
--   timezone              — IANA timezone string (default: Asia/Kolkata)
--   working_hours_enabled — master toggle (default: false = unrestricted)
--   working_hours_json    — per-day schedule with start/end/enabled flags
--
-- Enforcement happens in application code (call-manager.ts dispatchCall).
-- ============================================================================

ALTER TABLE tenant_voice_configs
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS working_hours_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS working_hours_json JSONB NOT NULL DEFAULT '{
    "mon": {"start": "09:00", "end": "18:00", "enabled": true},
    "tue": {"start": "09:00", "end": "18:00", "enabled": true},
    "wed": {"start": "09:00", "end": "18:00", "enabled": true},
    "thu": {"start": "09:00", "end": "18:00", "enabled": true},
    "fri": {"start": "09:00", "end": "18:00", "enabled": true},
    "sat": {"start": "09:00", "end": "13:00", "enabled": false},
    "sun": {"start": "09:00", "end": "13:00", "enabled": false}
  }';
