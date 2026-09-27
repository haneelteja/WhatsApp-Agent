-- ============================================================================
-- Alphabot — Lead Notification Settings
--
-- Adds per-tenant configurable recipients for lead alerts.
-- Run AFTER 045_notifications_inbox.sql.
-- ============================================================================

alter table tenant_notification_settings
  add column if not exists lead_notification_emails     text[] not null default '{}',
  add column if not exists lead_notification_wa_numbers text[] not null default '{}';
