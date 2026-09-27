-- Add configurable daily report recipients per tenant
alter table tenant_notification_settings
  add column if not exists daily_report_emails     text[] not null default '{}',
  add column if not exists daily_report_wa_numbers text[] not null default '{}';
