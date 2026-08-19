-- Composite index to accelerate the follow-up scheduler queries.
--
-- Both processFollowUps() and processLeadFollowUps() filter conversations by:
--   tenant_id, product_type, status = 'open', updated_at < cutoff
--
-- Without this index, every scheduler run does a sequential scan over all
-- tenant conversations. The index covers all four predicates so the planner
-- uses an index-only scan with LIMIT.
--
-- CONCURRENTLY avoids a full table lock on production.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_scheduler
  ON conversations (tenant_id, product_type, status, updated_at)
  WHERE status = 'open';
