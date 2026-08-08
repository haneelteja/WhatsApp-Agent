-- Add per-tenant "from" email address for escalation email alerts
ALTER TABLE tenant_notification_settings
  ADD COLUMN IF NOT EXISTS from_email text;
