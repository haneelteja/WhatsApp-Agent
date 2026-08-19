-- Fix IVFFlat probes not applying under PgBouncer transaction mode.
--
-- PgBouncer (transaction mode) drops session-level SET commands between
-- round-trips, so the previous `set_ivfflat_probes` RPC call was a no-op —
-- vector recall was stuck at the default 1 probe (~10% cluster search).
--
-- Fix: accept a `probes` parameter inside match_knowledge_base and apply it
-- with set_config(..., true) which is scoped to the current transaction
-- (supported in PgBouncer transaction mode).

CREATE OR REPLACE FUNCTION match_knowledge_base(
  query_embedding  vector,
  collection_ids   uuid[],
  match_count      int,
  match_threshold  float8,
  probes           int DEFAULT 10
)
RETURNS TABLE (
  id            uuid,
  question      text,
  answer        text,
  category      text,
  collection_id uuid,
  similarity    float8
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Apply within this transaction so PgBouncer transaction mode honours it
  PERFORM set_config('ivfflat.probes', probes::text, true);

  RETURN QUERY
  SELECT
    kb.id,
    kb.question,
    kb.answer,
    kb.category,
    kb.collection_id,
    (1 - (kb.embedding <=> query_embedding))::float8 AS similarity
  FROM knowledge_base kb
  WHERE kb.collection_id = ANY(collection_ids)
    AND kb.status = 'live'
    AND kb.embedding IS NOT NULL
    AND (1 - (kb.embedding <=> query_embedding)) > match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute to authenticated and service_role (same grants as before)
GRANT EXECUTE ON FUNCTION match_knowledge_base(vector, uuid[], int, float8, int) TO authenticated;
GRANT EXECUTE ON FUNCTION match_knowledge_base(vector, uuid[], int, float8, int) TO service_role;
