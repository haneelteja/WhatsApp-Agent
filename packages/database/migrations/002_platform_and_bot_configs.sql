-- ============================================================================
-- Alphabot Phase 2 — Platform Users, Products, Bot Configs, Free Trials,
--                    Notification Configs, WhatsApp Number Multi-Bot Support
--
-- Run this against your Supabase project AFTER 001_initial_schema.sql.
-- ============================================================================

-- ============================================================================
-- PLATFORM USERS  (your company's staff — not tied to any tenant)
-- ============================================================================
create table if not exists platform_users (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique,           -- auth.users.id
  role        text not null default 'admin'
                check (role in ('manager', 'admin')),
  name        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger platform_users_updated_at before update on platform_users
  for each row execute function set_updated_at();

create index idx_platform_users_user on platform_users(user_id);

-- ============================================================================
-- PLATFORM HELPER FUNCTIONS  (defined after table exists)
-- ============================================================================

-- Returns true if the calling user exists in platform_users
create or replace function is_platform_user()
returns boolean language sql stable security definer as $$
  select exists (select 1 from platform_users where user_id = auth.uid());
$$;

-- Returns the calling platform user's role ('manager' | 'admin'), or null
create or replace function get_platform_role()
returns text language sql stable security definer as $$
  select role from platform_users where user_id = auth.uid() limit 1;
$$;

-- ============================================================================
-- PRODUCTS  (your platform's product catalog — source of truth)
-- ============================================================================
create table if not exists products (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,        -- 'support_bot' | 'sales_bot' | 'lifecycle_bot'
  name            text not null,
  description     text,
  default_prompt  text not null,
  default_model   text not null default 'claude-sonnet-4-6',
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger products_updated_at before update on products
  for each row execute function set_updated_at();

-- Seed the three core products
insert into products (slug, name, description, default_prompt, default_model) values
(
  'support_bot',
  'Support Bot',
  'AI-powered customer support — answers questions, resolves issues, escalates when needed.',
  'You are a helpful customer support assistant. Answer questions accurately using the knowledge base. If you cannot confidently answer, say so and offer to escalate to a human agent. Be concise, friendly, and professional.',
  'claude-sonnet-4-6'
),
(
  'sales_bot',
  'Sales Bot',
  'AI sales assistant — qualifies leads, shares product info, hands off warm prospects.',
  'You are a sales assistant. Understand customer needs, share relevant product information, and guide warm leads toward a purchase decision. Detect buying intent and hand off to a human when the customer is ready to buy.',
  'claude-sonnet-4-6'
),
(
  'lifecycle_bot',
  'Lifecycle Bot',
  'Post-purchase assistant — order tracking, invoicing, payment collection, retention.',
  'You are an onboarding and account management assistant. Help customers track their orders, answer invoicing questions, and collect payments. Be proactive and professional.',
  'claude-sonnet-4-6'
)
on conflict (slug) do nothing;

-- ============================================================================
-- BOT CONFIGS  (per-client, per-product configuration overrides)
-- ============================================================================
create table if not exists bot_configs (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  product_slug          text not null references products(slug),

  -- null means "use products.default_*" — explicit override only
  system_prompt         text,
  ai_model              text,

  confidence_threshold  float not null default 0.6,
  escalation_triggers   text[] not null default '{}',

  -- Guardrails — cascade: platform default → product default → client override
  guardrails_json jsonb not null default '{
    "blocked_topics": [],
    "blocked_keywords": [],
    "max_response_length": 1000,
    "tone": "professional",
    "content_filters": {
      "no_personal_data": false,
      "no_external_links": false,
      "no_phone_numbers_in_response": false
    },
    "on_blocked_topic": "escalate",
    "on_low_confidence": "escalate"
  }',

  updated_at  timestamptz not null default now(),
  updated_by  uuid,                             -- auth.users.id of last editor

  unique (tenant_id, product_slug)
);

create trigger bot_configs_updated_at before update on bot_configs
  for each row execute function set_updated_at();

create index idx_bot_configs_tenant on bot_configs(tenant_id);

-- ============================================================================
-- WHATSAPP NUMBERS — extend to support multi-bot and multiple numbers per bot
-- ============================================================================

-- Fix: add 'twilio' to provider constraint (it was missing from Phase 1)
alter table whatsapp_numbers
  drop constraint if exists whatsapp_numbers_provider_check;

alter table whatsapp_numbers
  add constraint whatsapp_numbers_provider_check
    check (provider in ('meta_cloud','interakt','wati','gupshup','twilio'));

-- Add product_slug: which bot this number belongs to (nullable for existing rows)
alter table whatsapp_numbers
  add column if not exists product_slug  text references products(slug),
  add column if not exists label         text,           -- 'India Support', 'US Sales', etc.
  add column if not exists active        boolean not null default true;

-- Set existing rows to the correct product slug based on the webhook URL convention.
-- Operators should run: UPDATE whatsapp_numbers SET product_slug = 'support_bot' WHERE product_slug IS NULL;
-- The webhook handler already scopes by product_type, so this is informational for the UI.

create index if not exists idx_whatsapp_numbers_product on whatsapp_numbers(tenant_id, product_slug);

-- ============================================================================
-- FREE TRIALS  (per-client, per-product, auto-managed by scheduler)
-- ============================================================================
create table if not exists free_trials (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  product_slug          text not null references products(slug),

  starts_at             timestamptz not null default now(),
  ends_at               timestamptz not null,

  status                text not null default 'active'
                          check (status in ('active', 'expired', 'converted')),

  -- What's enabled during the trial
  allowed_model         text not null default 'claude-sonnet-4-6',
  phone_number          text,                  -- WhatsApp number activated for trial

  -- Notification tracking (timestamps of sent emails)
  notified_7d_at        timestamptz,
  notified_1d_at        timestamptz,
  notified_expired_at   timestamptz,

  created_by            uuid,                  -- platform user who created the trial
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (tenant_id, product_slug)
);

create trigger free_trials_updated_at before update on free_trials
  for each row execute function set_updated_at();

create index idx_free_trials_tenant on free_trials(tenant_id);
create index idx_free_trials_status on free_trials(status, ends_at asc);

-- ============================================================================
-- NOTIFICATION CONFIGS  (per event type, platform- or tenant-scoped)
-- ============================================================================
create table if not exists notification_configs (
  id            uuid primary key default gen_random_uuid(),

  -- Scope: 'platform' = applies to all tenants; 'tenant' = specific tenant only
  scope         text not null default 'platform'
                  check (scope in ('platform', 'tenant')),
  tenant_id     uuid references tenants(id) on delete cascade,  -- null when scope='platform'
  product_slug  text references products(slug),                 -- null = all products

  event_type    text not null check (event_type in (
    'trial_expiring_7d',
    'trial_expiring_1d',
    'trial_expired',
    'client_invited',
    'client_activated',
    'escalation_created',
    'escalation_timeout',
    'new_client_onboarded',
    'daily_report',
    'low_confidence_spike',
    'bot_error',
    'subscription_renewed'
  )),

  -- Who gets the email:
  -- e.g. [{"role":"platform_manager"}, {"role":"client_manager"}, {"email":"override@example.com"}]
  recipients    jsonb not null default '[]',

  enabled       boolean not null default true,
  updated_by    uuid,                           -- platform user who last changed this
  updated_at    timestamptz not null default now(),

  unique (scope, tenant_id, product_slug, event_type)
);

create trigger notification_configs_updated_at before update on notification_configs
  for each row execute function set_updated_at();

create index idx_notification_configs_scope on notification_configs(scope, event_type);
create index idx_notification_configs_tenant on notification_configs(tenant_id) where tenant_id is not null;

-- Seed platform-level defaults (all enabled, sensible default recipients)
insert into notification_configs (scope, tenant_id, product_slug, event_type, recipients, enabled) values
('platform', null, null, 'trial_expiring_7d',     '[{"role":"platform_admin"},{"role":"client_manager"}]', true),
('platform', null, null, 'trial_expiring_1d',     '[{"role":"platform_manager"},{"role":"client_manager"}]', true),
('platform', null, null, 'trial_expired',         '[{"role":"platform_manager"},{"role":"client_manager"}]', true),
('platform', null, null, 'client_invited',        '[{"role":"client_manager"}]', true),
('platform', null, null, 'client_activated',      '[{"role":"platform_manager"}]', true),
('platform', null, null, 'escalation_created',    '[{"role":"client_manager"},{"role":"client_admin"}]', true),
('platform', null, null, 'escalation_timeout',    '[{"role":"platform_admin"},{"role":"client_manager"}]', true),
('platform', null, null, 'new_client_onboarded',  '[{"role":"platform_manager"}]', true),
('platform', null, null, 'daily_report',          '[{"role":"platform_admin"},{"role":"client_manager"}]', true),
('platform', null, null, 'low_confidence_spike',  '[{"role":"platform_manager"},{"role":"client_manager"}]', true),
('platform', null, null, 'bot_error',             '[{"role":"platform_manager"}]', true),
('platform', null, null, 'subscription_renewed',  '[{"role":"client_manager"}]', true)
on conflict (scope, tenant_id, product_slug, event_type) do nothing;

-- ============================================================================
-- TENANT USERS — rename roles to match new hierarchy
-- ============================================================================

-- Step 1: migrate existing data to new role names
update tenant_users set role = 'client_manager' where role = 'admin';
update tenant_users set role = 'client_admin'   where role = 'supervisor';
-- 'agent' stays as 'agent'

-- Step 2: replace the role constraint
alter table tenant_users
  drop constraint if exists tenant_users_role_check;

alter table tenant_users
  add constraint tenant_users_role_check
    check (role in ('client_manager', 'client_admin', 'agent'));

-- ============================================================================
-- ROW LEVEL SECURITY — new tables
-- ============================================================================

alter table platform_users       enable row level security;
alter table products             enable row level security;
alter table bot_configs          enable row level security;
alter table free_trials          enable row level security;
alter table notification_configs enable row level security;

-- ─── platform_users ──────────────────────────────────────────────────────────
create policy "platform_users: read own row" on platform_users
  for select using (user_id = auth.uid());

create policy "platform_users: manager can manage all" on platform_users
  for all using (get_platform_role() = 'manager');

-- ─── products (read-only for everyone authenticated) ─────────────────────────
create policy "products: anyone can read" on products
  for select using (auth.uid() is not null);

create policy "products: manager can write" on products
  for all using (get_platform_role() = 'manager');

-- ─── bot_configs ─────────────────────────────────────────────────────────────
create policy "bot_configs: platform can read all" on bot_configs
  for select using (is_platform_user());

create policy "bot_configs: platform manager can write all" on bot_configs
  for all using (get_platform_role() = 'manager');

create policy "bot_configs: client_manager can read own" on bot_configs
  for select using (tenant_id = get_user_tenant_id());

create policy "bot_configs: client_manager can update own" on bot_configs
  for update using (
    tenant_id = get_user_tenant_id()
    and get_user_role() = 'client_manager'
  );

-- ─── free_trials ─────────────────────────────────────────────────────────────
create policy "free_trials: platform can manage all" on free_trials
  for all using (is_platform_user());

create policy "free_trials: client can read own" on free_trials
  for select using (tenant_id = get_user_tenant_id());

-- ─── notification_configs ────────────────────────────────────────────────────
create policy "notification_configs: platform manager can manage all" on notification_configs
  for all using (get_platform_role() = 'manager');

create policy "notification_configs: platform admin can read all" on notification_configs
  for select using (is_platform_user());

create policy "notification_configs: client_manager can manage own tenant" on notification_configs
  for all using (
    scope = 'tenant'
    and tenant_id = get_user_tenant_id()
    and get_user_role() = 'client_manager'
  );

create policy "notification_configs: client can read own tenant" on notification_configs
  for select using (
    scope = 'tenant'
    and tenant_id = get_user_tenant_id()
  );

-- ============================================================================
-- ROW LEVEL SECURITY — update existing policies to use new role names
-- and add platform bypass policies to all existing tables
-- ============================================================================

-- ─── Fix tenant_users policies (old role names) ───────────────────────────────
drop policy if exists "tenant_users: admin can manage" on tenant_users;
create policy "tenant_users: client_manager can manage" on tenant_users
  for all using (
    tenant_id = get_user_tenant_id()
    and get_user_role() = 'client_manager'
  );

-- Platform can read all tenant memberships
create policy "tenant_users: platform can read all" on tenant_users
  for select using (is_platform_user());

create policy "tenant_users: platform manager can write all" on tenant_users
  for all using (get_platform_role() = 'manager');

-- ─── Fix tenant_products policies ────────────────────────────────────────────
drop policy if exists "tenant_products: admin can write" on tenant_products;
create policy "tenant_products: client_manager can write" on tenant_products
  for all using (
    tenant_id = get_user_tenant_id()
    and get_user_role() = 'client_manager'
  );

create policy "tenant_products: platform can manage all" on tenant_products
  for all using (is_platform_user());

-- ─── Fix conversations policies (old role names) ─────────────────────────────
drop policy if exists "conversations: supervisor/admin see all" on conversations;
create policy "conversations: client_manager/admin see all" on conversations
  for select using (
    tenant_id = get_user_tenant_id()
    and get_user_role() in ('client_manager', 'client_admin')
  );

create policy "conversations: platform can read all" on conversations
  for select using (is_platform_user());

-- ─── Fix knowledge_base policies ─────────────────────────────────────────────
drop policy if exists "kb: admin/supervisor can write" on knowledge_base;
create policy "kb: client_manager can write" on knowledge_base
  for all using (
    tenant_id = get_user_tenant_id()
    and get_user_role() = 'client_manager'
  );

create policy "kb: platform can read all" on knowledge_base
  for select using (is_platform_user());

-- ─── Fix campaigns policies ───────────────────────────────────────────────────
drop policy if exists "campaigns: admin/supervisor manage" on campaigns;
create policy "campaigns: client_manager can manage" on campaigns
  for all using (
    tenant_id = get_user_tenant_id()
    and get_user_role() = 'client_manager'
  );

-- ─── Platform bypass: read all data on every tenant-scoped table ──────────────
create policy "tenants: platform can read all" on tenants
  for select using (is_platform_user());

create policy "tenants: platform manager can write" on tenants
  for all using (get_platform_role() = 'manager');

create policy "whatsapp_numbers: platform can manage all" on whatsapp_numbers
  for all using (is_platform_user());

create policy "contacts: platform can read all" on contacts
  for select using (is_platform_user());

create policy "escalations: platform can read all" on escalations
  for select using (is_platform_user());

create policy "usage_events: platform can read all" on usage_events
  for select using (is_platform_user());

create policy "subscriptions: platform can manage all" on subscriptions
  for all using (is_platform_user());

create policy "kb_suggestions: platform can read all" on kb_suggestions
  for select using (is_platform_user());
