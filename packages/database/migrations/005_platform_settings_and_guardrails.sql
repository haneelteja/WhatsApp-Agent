-- ============================================================================
-- Alphabot Phase 5 — Platform Settings & Guardrails
--
-- Run AFTER 004_kb_documents.sql.
-- Adds kb_only_mode to bot_configs and a platform_settings table for
-- global guardrails that apply across all tenants.
-- ============================================================================

-- ── KB-only mode per bot config ───────────────────────────────────────────────
alter table bot_configs
  add column if not exists kb_only_mode boolean not null default false;

-- ── Platform-level settings (global guardrails, feature flags, etc.) ─────────
create table if not exists platform_settings (
  key        text primary key,
  value      jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references platform_users(id) on delete set null
);

-- Seed global guardrails defaults
insert into platform_settings (key, value) values (
  'guardrails',
  '{
    "global_blocked_topics": [],
    "global_blocked_keywords": [],
    "max_response_length": 2000,
    "enforce_kb_only_globally": false,
    "content_filters": {
      "no_personal_data": false,
      "no_external_links": false
    }
  }'::jsonb
) on conflict (key) do nothing;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table platform_settings enable row level security;

-- Authenticated users can read (needed for webhook worker to load settings)
create policy "platform_settings: authenticated can read"
  on platform_settings for select
  using (auth.role() = 'authenticated');

-- Only platform managers can write
create policy "platform_settings: platform manager can write"
  on platform_settings for all
  using (get_platform_role() = 'manager');
