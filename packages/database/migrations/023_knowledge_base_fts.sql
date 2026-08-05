-- Migration 023: Add full-text search support to knowledge_base.
-- The previous ILIKE fallback triggered sequential scans. A generated tsvector
-- column with a GIN index enables fast full-text search without application changes.
--
-- NOTE: Both ALTER TABLE (populates generated column for all rows) and CREATE INDEX
-- exceed Supabase's default maintenance_work_mem (32 MB). Use SET LOCAL inside a
-- single explicit transaction so the raised limit applies to both operations.

BEGIN;
SET LOCAL maintenance_work_mem = '64MB';

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS fts_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector(
        'english',
        coalesce(question, '') || ' ' || coalesce(answer, '') || ' ' || coalesce(category, '')
      )
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_fts
  ON knowledge_base USING GIN (fts_vector);

COMMIT;

-- Drop the slow ILIKE-based RPC if it exists and replace with a FTS version
CREATE OR REPLACE FUNCTION search_knowledge_base_text(
  query_text     TEXT,
  collection_ids UUID[],
  match_count    INT DEFAULT 5
)
RETURNS SETOF knowledge_base
LANGUAGE SQL STABLE AS $$
  SELECT kb.*
  FROM   knowledge_base kb
  WHERE  kb.status = 'live'
    AND  (
      array_length(collection_ids, 1) IS NULL
      OR kb.collection_id = ANY(collection_ids)
    )
    AND  kb.fts_vector @@ websearch_to_tsquery('english', query_text)
  ORDER BY ts_rank(kb.fts_vector, websearch_to_tsquery('english', query_text)) DESC
  LIMIT  match_count;
$$;

-- Helper to set ivfflat probes per session (improves vector recall without full scan)
CREATE OR REPLACE FUNCTION set_ivfflat_probes(probes INT)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'SET ivfflat.probes = ' || probes;
END;
$$;
