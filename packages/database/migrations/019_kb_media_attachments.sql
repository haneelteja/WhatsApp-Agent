-- KB Media Attachments: files the bot sends inline in WhatsApp chats
-- Distinct from kb_documents (which are for text extraction into Q&A entries).
-- These are files shown to CUSTOMERS: product images, brochures, price lists, etc.

CREATE TABLE IF NOT EXISTS kb_media_attachments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  collection_id     uuid        REFERENCES kb_collections(id) ON DELETE SET NULL,
  name              text        NOT NULL,
  description       text,                        -- what this file contains (context for matching)
  file_type         text        NOT NULL CHECK (file_type IN ('image', 'document')),
  mime_type         text        NOT NULL,
  original_filename text        NOT NULL,
  storage_path      text        NOT NULL,
  public_url        text        NOT NULL,        -- Supabase public CDN URL for WhatsApp to fetch
  file_size         bigint      NOT NULL DEFAULT 0,
  send_count        integer     NOT NULL DEFAULT 0,   -- incremented each time bot sends this file
  active            boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_media_tenant       ON kb_media_attachments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kb_media_collection   ON kb_media_attachments(collection_id) WHERE collection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kb_media_active       ON kb_media_attachments(tenant_id, active);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION update_kb_media_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_kb_media_updated_at ON kb_media_attachments;
CREATE TRIGGER trg_kb_media_updated_at
  BEFORE UPDATE ON kb_media_attachments
  FOR EACH ROW EXECUTE FUNCTION update_kb_media_updated_at();

-- RLS: tenants can only see their own attachments
ALTER TABLE kb_media_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY kb_media_tenant_isolation ON kb_media_attachments
  USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);
