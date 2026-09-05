-- Performance indexes identified during the 2026-09-05 audit.
-- All created CONCURRENTLY — safe to apply to a live production database
-- without locking the table for reads or writes.

-- usage_events: analytics queries filter by tenant + time window (7 / 30 day).
-- Eliminates the sequential scan that fetches 100K+ rows into JS for aggregation.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_events_tenant_date
  ON usage_events (tenant_id, created_at DESC);

-- messages: conversation history paging (cursor-based) and last-message lookup.
-- The INCLUDE columns avoid a separate heap fetch for the list-view projection.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conv_ts_cover
  ON messages (conversation_id, timestamp DESC)
  INCLUDE (id, content, role);

-- voice_calls: 30-day cost / duration aggregate and 14-day chart query.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_voice_calls_tenant_date
  ON voice_calls (tenant_id, created_at DESC);

-- contacts: sentiment filter applied on the contacts list page.
-- Allows an index scan on the JSONB sentiment field instead of a sequential scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_tenant_sentiment
  ON contacts (tenant_id, (memory_json->>'sentiment'));

-- ai_insights: startup catch-up query checks for recent insight records.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_insights_generated_at
  ON ai_insights (generated_at DESC);

-- lifecycle_sends: scheduler checks already-sent contacts per sequence.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lifecycle_sends_seq_contact
  ON lifecycle_sends (sequence_id, contact_id);
