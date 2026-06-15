-- ============================================================================
-- Alphabot — Tenant Notification Settings
-- Stores per-tenant escalation notification config
-- ============================================================================

create table if not exists tenant_notification_settings (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null unique references tenants(id) on delete cascade,
  escalation_emails           text[] not null default '{}',
  escalation_wa_numbers       text[] not null default '{}',
  escalation_customer_message text not null default 'Your query has been escalated to our team. A team member will get back to you shortly.',
  updated_at                  timestamptz not null default now()
);

alter table tenant_notification_settings enable row level security;

grant select, insert, update on tenant_notification_settings to service_role;
