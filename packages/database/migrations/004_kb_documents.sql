-- ============================================================================
-- Alphabot Phase 4 — Knowledge Base Document Ingestion
--
-- Run AFTER 003_kb_collections_and_rag.sql.
-- Adds kb_documents table for file-based KB ingestion (PDF, DOCX, images, text).
-- Each uploaded document is chunked and stored as knowledge_base entries.
-- ============================================================================

-- ============================================================================
-- KB DOCUMENTS
-- Tracks every uploaded file and its async processing state.
-- ============================================================================
create table if not exists kb_documents (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  collection_id   uuid not null references kb_collections(id) on delete cascade,
  name            text not null,
  file_type       text not null
                    check (file_type in ('pdf', 'docx', 'txt', 'md', 'image')),
  mime_type       text not null,
  storage_path    text not null,
  file_size       bigint,
  status          text not null default 'pending'
                    check (status in ('pending', 'processing', 'done', 'error')),
  error_message   text,
  chunk_count     integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger kb_documents_updated_at before update on kb_documents
  for each row execute function set_updated_at();

create index idx_kb_documents_collection on kb_documents(collection_id);
create index idx_kb_documents_tenant     on kb_documents(tenant_id);
create index idx_kb_documents_status     on kb_documents(status) where status in ('pending', 'processing');

-- ============================================================================
-- KNOWLEDGE BASE — add source_document_id
-- Entries created from document chunks reference the source document.
-- Deleting a document cascades to all its derived knowledge_base entries.
-- ============================================================================
alter table knowledge_base
  add column if not exists source_document_id uuid references kb_documents(id) on delete cascade;

create index if not exists idx_kb_source_document
  on knowledge_base(source_document_id) where source_document_id is not null;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table kb_documents enable row level security;

-- Tenant staff can read their own documents
create policy "kb_documents: read own tenant" on kb_documents
  for select using (tenant_id = get_user_tenant_id());

-- client_manager can fully manage documents in their tenant
create policy "kb_documents: client_manager can manage" on kb_documents
  for all using (
    tenant_id = get_user_tenant_id()
    and get_user_role() = 'client_manager'
  );

-- Platform staff can read all
create policy "kb_documents: platform can read all" on kb_documents
  for select using (is_platform_user());

-- Platform managers can write all
create policy "kb_documents: platform manager can write all" on kb_documents
  for all using (get_platform_role() = 'manager');
