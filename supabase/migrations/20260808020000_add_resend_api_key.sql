-- Add per-tenant Resend API key for sending escalation emails from their own account
ALTER TABLE tenant_notification_settings
  ADD COLUMN IF NOT EXISTS resend_api_key text;
