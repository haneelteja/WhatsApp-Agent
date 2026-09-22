-- KB Entry Suggestions: AI-drafted Q&A entries sourced from unanswered queries.
-- Tenants review and approve/reject them in the KB management page.

CREATE TABLE IF NOT EXISTS kb_entry_suggestions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  answer_draft    TEXT NOT NULL,
  source_queries  TEXT[] NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  collection_id   UUID REFERENCES kb_collections(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_kb_suggestions_tenant_status
  ON kb_entry_suggestions (tenant_id, status, created_at DESC);

-- Service role access
ALTER TABLE kb_entry_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON kb_entry_suggestions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
