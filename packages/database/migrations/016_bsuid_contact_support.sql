-- ============================================================================
-- Migration 016 — WhatsApp BSUID contact support
-- When a user adopts a WhatsApp username, Meta Cloud API returns a BSUID
-- (opaque ID) instead of a phone number on their first message.
-- We add a separate bsuid column and make phone nullable so we can store
-- both phone contacts and BSUID-only contacts in the same table.
-- ============================================================================

-- Add bsuid column
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS bsuid TEXT;

-- Allow phone to be null (BSUID-only contacts have no phone on first message)
ALTER TABLE contacts ALTER COLUMN phone DROP NOT NULL;

-- Unique constraint for BSUID-keyed contacts
-- NULL values don't conflict under a unique constraint, so phone-only
-- contacts (bsuid = NULL) won't violate this.
ALTER TABLE contacts ADD CONSTRAINT contacts_tenant_bsuid_unique
  UNIQUE (tenant_id, bsuid);

-- Index for fast BSUID lookups
CREATE INDEX IF NOT EXISTS idx_contacts_bsuid ON contacts(tenant_id, bsuid)
  WHERE bsuid IS NOT NULL;

-- Ensure at least one of phone or bsuid is always present
ALTER TABLE contacts ADD CONSTRAINT contacts_phone_or_bsuid_required
  CHECK (phone IS NOT NULL OR bsuid IS NOT NULL);
