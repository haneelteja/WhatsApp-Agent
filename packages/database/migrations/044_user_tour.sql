-- ── Migration 044: Guided tour completion tracking ───────────────────────────
-- Stores when a user completed (or skipped) the onboarding tour so it is
-- never shown again on any device after they dismiss it.

ALTER TABLE tenant_users
  ADD COLUMN IF NOT EXISTS tour_completed_at TIMESTAMPTZ;
