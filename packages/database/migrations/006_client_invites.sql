-- ============================================================================
-- Alphabot — Client Invite Flow
--
-- Run AFTER 005_platform_settings_and_guardrails.sql.
-- Allows platform managers to invite client users by email.
-- ============================================================================

create table if not exists client_invites (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  email       text not null,
  role        text not null default 'client_manager'
                check (role in ('client_manager', 'client_admin', 'agent')),
  token       uuid not null unique default gen_random_uuid(),
  invited_by  uuid references platform_users(id) on delete set null,
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

create index idx_client_invites_token  on client_invites(token)     where accepted_at is null;
create index idx_client_invites_tenant on client_invites(tenant_id);

alter table client_invites enable row level security;

-- Platform managers can fully manage invites
create policy "client_invites: platform manager can manage"
  on client_invites for all
  using (get_platform_role() = 'manager');

-- Grants so service_role can insert/read (used by server actions)
grant select, insert, update on client_invites to service_role;
