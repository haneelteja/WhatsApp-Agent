-- ============================================================================
-- Alphabot — Daily Report Notification Recipients
-- Run AFTER 046_lead_notifications.sql.
-- ============================================================================

alter table tenant_notification_settings
  add column if not exists daily_report_emails     text[] not null default '{}',
  add column if not exists daily_report_wa_numbers text[] not null default '{}';
