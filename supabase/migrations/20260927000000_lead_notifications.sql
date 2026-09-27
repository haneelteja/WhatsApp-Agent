-- Add configurable lead notification recipients per tenant
alter table tenant_notification_settings
  add column if not exists lead_notification_emails     text[] not null default '{}',
  add column if not exists lead_notification_wa_numbers text[] not null default '{}';
