-- ============================================================================
-- Alphabot Phase 1 — Initial Schema
-- Run this once against your Supabase project via the SQL editor or CLI.
-- ============================================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";
create extension if not exists "vector";       -- pgvector for KB embeddings

-- ─── Helper: updated_at trigger ──────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- TENANTS
-- ============================================================================
create table if not exists tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  plan        text not null default 'starter' check (plan in ('starter','growth','scale')),
  provider    text not null default 'meta_cloud'
                check (provider in ('meta_cloud','interakt','wati','gupshup')),
  status      text not null default 'trial'
                check (status in ('active','suspended','trial')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger tenants_updated_at before update on tenants
  for each row execute function set_updated_at();

-- ============================================================================
-- TENANT PRODUCTS
-- ============================================================================
create table if not exists tenant_products (
  tenant_id    uuid not null references tenants(id) on delete cascade,
  product_type text not null check (product_type in ('support_bot','sales_bot','lifecycle_bot')),
  tier         text not null default 'base' check (tier in ('base','advanced')),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  primary key  (tenant_id, product_type)
);

-- ============================================================================
-- WHATSAPP NUMBERS (one per tenant per provider account)
-- ============================================================================
create table if not exists whatsapp_numbers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  phone_number   text not null,
  provider       text not null check (provider in ('meta_cloud','interakt','wati','gupshup')),
  config_json    jsonb not null default '{}',  -- encrypted tokens stored here
  created_at     timestamptz not null default now(),
  unique (tenant_id, phone_number)
);

create index idx_whatsapp_numbers_tenant on whatsapp_numbers(tenant_id);

-- ============================================================================
-- CONTACTS (one record per unique phone per tenant)
-- ============================================================================
create table if not exists contacts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  phone       text not null,
  name        text,
  memory_json jsonb not null default '{"preferences":{},"order_history":[],"open_issues":[],"last_interaction":null}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, phone)
);

create trigger contacts_updated_at before update on contacts
  for each row execute function set_updated_at();

create index idx_contacts_tenant on contacts(tenant_id);
create index idx_contacts_phone on contacts(tenant_id, phone);

-- ============================================================================
-- CONVERSATIONS
-- ============================================================================
create table if not exists conversations (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  contact_id         uuid not null references contacts(id) on delete cascade,
  product_type       text not null check (product_type in ('support_bot','sales_bot','lifecycle_bot')),
  status             text not null default 'open'
                       check (status in ('open','escalated','resolved','bot_paused')),
  assigned_agent_id  uuid,                -- FK to auth.users (Supabase managed)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger conversations_updated_at before update on conversations
  for each row execute function set_updated_at();

create index idx_conversations_tenant on conversations(tenant_id);
create index idx_conversations_contact on conversations(contact_id);
create index idx_conversations_status on conversations(tenant_id, status);
create index idx_conversations_updated on conversations(tenant_id, updated_at desc);

-- ============================================================================
-- MESSAGES
-- ============================================================================
create table if not exists messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete cascade,
  role             text not null check (role in ('user','assistant','system')),
  content          text not null,
  media_url        text,
  media_type       text check (media_type in ('image','audio','document','video')),
  whatsapp_msg_id  text unique,           -- Meta message ID for dedup
  confidence_score numeric(4,3),          -- 0.000–1.000 AI confidence
  timestamp        timestamptz not null default now()
);

create index idx_messages_conversation on messages(conversation_id, timestamp asc);
create index idx_messages_whatsapp_id on messages(whatsapp_msg_id) where whatsapp_msg_id is not null;

-- ============================================================================
-- ESCALATIONS
-- ============================================================================
create table if not exists escalations (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete cascade,
  trigger_reason   text not null,
  agent_id         uuid,                  -- FK to auth.users
  status           text not null default 'pending'
                     check (status in ('pending','assigned','resolved')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger escalations_updated_at before update on escalations
  for each row execute function set_updated_at();

create index idx_escalations_conversation on escalations(conversation_id);
create index idx_escalations_status on escalations(status, created_at desc);

-- ============================================================================
-- KNOWLEDGE BASE
-- ============================================================================
create table if not exists knowledge_base (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  product_type text not null check (product_type in ('support_bot','sales_bot','lifecycle_bot')),
  category     text not null default 'General',
  question     text not null,
  answer       text not null,
  embedding    vector(1536),              -- OpenAI/Claude embedding dimension
  status       text not null default 'draft'
                 check (status in ('draft','review','live','archived')),
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger knowledge_base_updated_at before update on knowledge_base
  for each row execute function set_updated_at();

create index idx_kb_tenant_product on knowledge_base(tenant_id, product_type);
create index idx_kb_status on knowledge_base(tenant_id, status);

-- pgvector cosine similarity index for semantic search
create index idx_kb_embedding on knowledge_base
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ============================================================================
-- KB SUGGESTIONS (AI-generated, weekly digest)
-- ============================================================================
create table if not exists kb_suggestions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  product_type text not null check (product_type in ('support_bot','sales_bot','lifecycle_bot')),
  suggested_q  text not null,
  suggested_a  text not null,
  frequency    integer not null default 1,
  status       text not null default 'pending'
                 check (status in ('pending','accepted','dismissed')),
  created_at   timestamptz not null default now()
);

create index idx_kb_suggestions_tenant on kb_suggestions(tenant_id, status);

-- ============================================================================
-- ORDERS
-- ============================================================================
create table if not exists orders (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  contact_id       uuid not null references contacts(id),
  conversation_id  uuid not null references conversations(id),
  items_json       jsonb not null default '[]',
  total            numeric(12,2) not null,
  status           text not null default 'pending'
                     check (status in ('pending','confirmed','dispatched','delivered','cancelled')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger orders_updated_at before update on orders
  for each row execute function set_updated_at();

create index idx_orders_tenant on orders(tenant_id);
create index idx_orders_contact on orders(contact_id);
create index idx_orders_status on orders(tenant_id, status);

-- ============================================================================
-- PAYMENTS (PhonePe)
-- ============================================================================
create table if not exists payments (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references orders(id) on delete cascade,
  phonepe_ref          text,
  link_url             text,
  status               text not null default 'pending'
                         check (status in ('pending','paid','failed','expired')),
  webhook_received_at  timestamptz,
  created_at           timestamptz not null default now()
);

create index idx_payments_order on payments(order_id);
create index idx_payments_status on payments(status);

-- ============================================================================
-- CAMPAIGNS (Sales Bot outbound)
-- ============================================================================
create table if not exists campaigns (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null,
  trigger_type  text not null check (trigger_type in ('manual','webhook','crm_event')),
  template_id   text not null,
  status        text not null default 'draft'
                  check (status in ('draft','active','paused','completed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger campaigns_updated_at before update on campaigns
  for each row execute function set_updated_at();

create index idx_campaigns_tenant on campaigns(tenant_id);

-- ============================================================================
-- FOLLOW-UP SEQUENCES (BullMQ schedules persisted here)
-- ============================================================================
create table if not exists follow_up_sequences (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  contact_id    uuid not null references contacts(id),
  step          integer not null,         -- 1 = Day 1, 2 = Day 3, 3 = Day 7
  scheduled_at  timestamptz not null,
  sent_at       timestamptz,
  status        text not null default 'scheduled'
                  check (status in ('scheduled','sent','failed','cancelled'))
);

create index idx_follow_up_campaign on follow_up_sequences(campaign_id);
create index idx_follow_up_scheduled on follow_up_sequences(scheduled_at)
  where status = 'scheduled';

-- ============================================================================
-- USAGE EVENTS (metered from day 1 even with flat billing)
-- ============================================================================
create table if not exists usage_events (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  product_type text not null check (product_type in ('support_bot','sales_bot','lifecycle_bot')),
  event_type   text not null
                 check (event_type in (
                   'conversation_started','message_sent','ai_token_used',
                   'escalation','kb_query'
                 )),
  token_count  integer,                  -- only for ai_token_used events
  created_at   timestamptz not null default now()
);

create index idx_usage_tenant_month on usage_events(tenant_id, created_at desc);
create index idx_usage_product on usage_events(tenant_id, product_type, created_at desc);

-- ============================================================================
-- SUBSCRIPTIONS
-- ============================================================================
create table if not exists subscriptions (
  tenant_id          uuid not null references tenants(id) on delete cascade,
  product_type       text not null check (product_type in ('support_bot','sales_bot','lifecycle_bot')),
  tier               text not null check (tier in ('starter','growth','scale')),
  billing_cycle      text not null default 'monthly' check (billing_cycle in ('monthly','annual')),
  next_billing_date  date not null,
  primary key        (tenant_id, product_type)
);

-- ============================================================================
-- AGENT SESSIONS (tracks human takeover periods)
-- ============================================================================
create table if not exists agent_sessions (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete cascade,
  agent_id         uuid not null,        -- FK to auth.users
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  resolution_note  text
);

create index idx_agent_sessions_conversation on agent_sessions(conversation_id);
create index idx_agent_sessions_agent on agent_sessions(agent_id, started_at desc);

-- ============================================================================
-- TENANT USERS (maps Supabase auth.users to tenants with roles)
-- ============================================================================
create table if not exists tenant_users (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  user_id     uuid not null,             -- auth.users.id
  role        text not null default 'agent' check (role in ('admin','supervisor','agent')),
  invited_by  uuid,
  created_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index idx_tenant_users_user on tenant_users(user_id);
create index idx_tenant_users_tenant on tenant_users(tenant_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
alter table tenants           enable row level security;
alter table tenant_products   enable row level security;
alter table whatsapp_numbers  enable row level security;
alter table contacts          enable row level security;
alter table conversations     enable row level security;
alter table messages          enable row level security;
alter table escalations       enable row level security;
alter table knowledge_base    enable row level security;
alter table kb_suggestions    enable row level security;
alter table orders            enable row level security;
alter table payments          enable row level security;
alter table campaigns         enable row level security;
alter table follow_up_sequences enable row level security;
alter table usage_events      enable row level security;
alter table subscriptions     enable row level security;
alter table agent_sessions    enable row level security;
alter table tenant_users      enable row level security;

-- Helper: get the calling user's tenant_id
create or replace function get_user_tenant_id()
returns uuid language sql stable security definer as $$
  select tenant_id from tenant_users where user_id = auth.uid() limit 1;
$$;

-- Helper: get calling user's role in their tenant
create or replace function get_user_role()
returns text language sql stable security definer as $$
  select role from tenant_users where user_id = auth.uid() limit 1;
$$;

-- ─── Tenant Users ─────────────────────────────────────────────────────────────
create policy "tenant_users: read own tenant members" on tenant_users
  for select using (tenant_id = get_user_tenant_id());

create policy "tenant_users: admin can manage" on tenant_users
  for all using (tenant_id = get_user_tenant_id() and get_user_role() = 'admin');

-- ─── Tenants ─────────────────────────────────────────────────────────────────
create policy "tenants: read own" on tenants
  for select using (id = get_user_tenant_id());

-- ─── Tenant Products ─────────────────────────────────────────────────────────
create policy "tenant_products: read own" on tenant_products
  for select using (tenant_id = get_user_tenant_id());

create policy "tenant_products: admin can write" on tenant_products
  for all using (tenant_id = get_user_tenant_id() and get_user_role() = 'admin');

-- ─── WhatsApp Numbers ────────────────────────────────────────────────────────
create policy "whatsapp_numbers: read own" on whatsapp_numbers
  for select using (tenant_id = get_user_tenant_id());

-- ─── Contacts ────────────────────────────────────────────────────────────────
create policy "contacts: read own tenant" on contacts
  for select using (tenant_id = get_user_tenant_id());

create policy "contacts: write own tenant" on contacts
  for insert with check (tenant_id = get_user_tenant_id());

create policy "contacts: update own tenant" on contacts
  for update using (tenant_id = get_user_tenant_id());

-- ─── Conversations ───────────────────────────────────────────────────────────
create policy "conversations: supervisor/admin see all" on conversations
  for select using (
    tenant_id = get_user_tenant_id()
    and get_user_role() in ('admin','supervisor')
  );

create policy "conversations: agent sees assigned" on conversations
  for select using (
    tenant_id = get_user_tenant_id()
    and get_user_role() = 'agent'
    and assigned_agent_id = auth.uid()
  );

create policy "conversations: write own tenant" on conversations
  for insert with check (tenant_id = get_user_tenant_id());

create policy "conversations: update own tenant" on conversations
  for update using (tenant_id = get_user_tenant_id());

-- ─── Messages ────────────────────────────────────────────────────────────────
create policy "messages: read via conversation" on messages
  for select using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and c.tenant_id = get_user_tenant_id()
    )
  );

create policy "messages: insert via conversation" on messages
  for insert with check (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and c.tenant_id = get_user_tenant_id()
    )
  );

-- ─── Escalations ─────────────────────────────────────────────────────────────
create policy "escalations: read own tenant" on escalations
  for select using (
    exists (
      select 1 from conversations c
      where c.id = escalations.conversation_id
        and c.tenant_id = get_user_tenant_id()
    )
  );

-- ─── Knowledge Base ──────────────────────────────────────────────────────────
create policy "kb: read own tenant live" on knowledge_base
  for select using (tenant_id = get_user_tenant_id());

create policy "kb: admin/supervisor can write" on knowledge_base
  for all using (
    tenant_id = get_user_tenant_id()
    and get_user_role() in ('admin','supervisor')
  );

-- ─── KB Suggestions ──────────────────────────────────────────────────────────
create policy "kb_suggestions: read own" on kb_suggestions
  for select using (tenant_id = get_user_tenant_id());

-- ─── Orders ──────────────────────────────────────────────────────────────────
create policy "orders: read own tenant" on orders
  for select using (tenant_id = get_user_tenant_id());

-- ─── Payments ────────────────────────────────────────────────────────────────
create policy "payments: read via order" on payments
  for select using (
    exists (
      select 1 from orders o
      where o.id = payments.order_id
        and o.tenant_id = get_user_tenant_id()
    )
  );

-- ─── Campaigns ───────────────────────────────────────────────────────────────
create policy "campaigns: read own" on campaigns
  for select using (tenant_id = get_user_tenant_id());

create policy "campaigns: admin/supervisor manage" on campaigns
  for all using (
    tenant_id = get_user_tenant_id()
    and get_user_role() in ('admin','supervisor')
  );

-- ─── Follow-up Sequences ─────────────────────────────────────────────────────
create policy "follow_up: read own" on follow_up_sequences
  for select using (
    exists (
      select 1 from campaigns c
      where c.id = follow_up_sequences.campaign_id
        and c.tenant_id = get_user_tenant_id()
    )
  );

-- ─── Usage Events ────────────────────────────────────────────────────────────
create policy "usage_events: read own" on usage_events
  for select using (tenant_id = get_user_tenant_id());

-- ─── Subscriptions ───────────────────────────────────────────────────────────
create policy "subscriptions: read own" on subscriptions
  for select using (tenant_id = get_user_tenant_id());

-- ─── Agent Sessions ──────────────────────────────────────────────────────────
create policy "agent_sessions: read own tenant" on agent_sessions
  for select using (
    exists (
      select 1 from conversations c
      where c.id = agent_sessions.conversation_id
        and c.tenant_id = get_user_tenant_id()
    )
  );

-- ============================================================================
-- SUPABASE REALTIME PUBLICATIONS
-- ============================================================================
alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table escalations;
alter publication supabase_realtime add table agent_sessions;
