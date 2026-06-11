-- ============================================================================
-- Alphabot Phase 3 — Knowledge Base Collections & RAG Infrastructure
--
-- Run AFTER 002_platform_and_bot_configs.sql.
-- ============================================================================

-- ============================================================================
-- STEP 1: Update embedding column dimension (1536 → 1024)
-- All existing embeddings are NULL, so the cast is safe.
-- Voyage AI voyage-3 outputs 1024-dimensional vectors.
-- ============================================================================

drop index if exists idx_kb_embedding;

alter table knowledge_base
  alter column embedding type vector(1024) using null;

-- ============================================================================
-- KB COLLECTIONS  (named, reusable knowledge bases)
-- A single collection can be assigned to multiple bots across the platform.
-- ============================================================================
create table if not exists kb_collections (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  name             text not null,
  description      text,
  embedding_model  text not null default 'voyage-3',
  entry_count      integer not null default 0,    -- denormalized, kept in sync via trigger
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger kb_collections_updated_at before update on kb_collections
  for each row execute function set_updated_at();

create index idx_kb_collections_tenant on kb_collections(tenant_id);

-- ============================================================================
-- KB COLLECTION BOTS  (M2M: collections ↔ product bots)
-- One collection can be used by multiple bots.
-- One bot can draw from multiple collections (ordered by priority, lowest = highest).
-- ============================================================================
create table if not exists kb_collection_bots (
  collection_id  uuid not null references kb_collections(id) on delete cascade,
  tenant_id      uuid not null references tenants(id) on delete cascade,
  product_slug   text not null references products(slug),
  priority       integer not null default 1,
  created_at     timestamptz not null default now(),
  primary key (collection_id, tenant_id, product_slug)
);

create index idx_kb_collection_bots_tenant_product
  on kb_collection_bots(tenant_id, product_slug, priority asc);

-- ============================================================================
-- KNOWLEDGE BASE — add collection_id foreign key
-- Existing entries get collection_id = NULL (they remain as standalone entries
-- reachable via the old product_type-based lookup as a fallback).
-- ============================================================================
alter table knowledge_base
  add column if not exists collection_id uuid references kb_collections(id) on delete set null;

create index if not exists idx_kb_collection
  on knowledge_base(collection_id) where collection_id is not null;

-- Rebuild the ivfflat index for the new 1024-dimension vectors
create index idx_kb_embedding on knowledge_base
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ============================================================================
-- TRIGGER: keep kb_collections.entry_count in sync
-- ============================================================================
create or replace function sync_kb_collection_entry_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' and new.collection_id is not null then
    update kb_collections set entry_count = entry_count + 1 where id = new.collection_id;
  elsif TG_OP = 'DELETE' and old.collection_id is not null then
    update kb_collections set entry_count = greatest(0, entry_count - 1) where id = old.collection_id;
  elsif TG_OP = 'UPDATE' then
    if old.collection_id is distinct from new.collection_id then
      if old.collection_id is not null then
        update kb_collections set entry_count = greatest(0, entry_count - 1) where id = old.collection_id;
      end if;
      if new.collection_id is not null then
        update kb_collections set entry_count = entry_count + 1 where id = new.collection_id;
      end if;
    end if;
  end if;
  return null;
end;
$$;

create trigger kb_entry_count_sync
  after insert or update or delete on knowledge_base
  for each row execute function sync_kb_collection_entry_count();

-- ============================================================================
-- RPC: match_knowledge_base
-- Vector similarity search across one or more collections.
-- Called by the webhook RAG pipeline.
-- ============================================================================
create or replace function match_knowledge_base(
  query_embedding  vector(1024),
  collection_ids   uuid[],
  match_count      int   default 5,
  match_threshold  float default 0.5
)
returns table (
  id          uuid,
  question    text,
  answer      text,
  category    text,
  similarity  float
)
language sql stable as $$
  select
    kb.id,
    kb.question,
    kb.answer,
    kb.category,
    1 - (kb.embedding <=> query_embedding) as similarity
  from knowledge_base kb
  where
    kb.collection_id = any(collection_ids)
    and kb.status = 'live'
    and kb.embedding is not null
    and 1 - (kb.embedding <=> query_embedding) > match_threshold
  order by kb.embedding <=> query_embedding
  limit match_count;
$$;

-- RPC: text fallback search (no embeddings needed)
create or replace function search_knowledge_base_text(
  query_text     text,
  collection_ids uuid[],
  match_count    int default 5
)
returns table (id uuid, question text, answer text, category text)
language sql stable as $$
  select id, question, answer, category
  from knowledge_base
  where
    collection_id = any(collection_ids)
    and status = 'live'
    and (
      question ilike '%' || query_text || '%'
      or answer ilike '%' || query_text || '%'
      or category ilike '%' || query_text || '%'
    )
  limit match_count;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table kb_collections     enable row level security;
alter table kb_collection_bots enable row level security;

-- ─── kb_collections ──────────────────────────────────────────────────────────
create policy "kb_collections: read own tenant" on kb_collections
  for select using (tenant_id = get_user_tenant_id());

create policy "kb_collections: client_manager can manage" on kb_collections
  for all using (
    tenant_id = get_user_tenant_id()
    and get_user_role() = 'client_manager'
  );

create policy "kb_collections: platform can read all" on kb_collections
  for select using (is_platform_user());

create policy "kb_collections: platform manager can write all" on kb_collections
  for all using (get_platform_role() = 'manager');

-- ─── kb_collection_bots ──────────────────────────────────────────────────────
create policy "kb_collection_bots: read own tenant" on kb_collection_bots
  for select using (tenant_id = get_user_tenant_id());

create policy "kb_collection_bots: client_manager can manage" on kb_collection_bots
  for all using (
    tenant_id = get_user_tenant_id()
    and get_user_role() = 'client_manager'
  );

create policy "kb_collection_bots: platform can manage all" on kb_collection_bots
  for all using (is_platform_user());
