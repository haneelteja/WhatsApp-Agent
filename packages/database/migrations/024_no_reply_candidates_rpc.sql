-- Migration 024: RPC to find conversations eligible for no-reply call trigger.
-- Replaces N×M sequential queries in the scheduler (3 queries per conversation
-- across all bots) with a single parameterised SQL call.

CREATE OR REPLACE FUNCTION get_no_reply_candidates(
  p_tenant_id    UUID,
  p_product_slug TEXT,
  p_cutoff       TIMESTAMPTZ
)
RETURNS TABLE(
  conversation_id UUID,
  contact_phone   TEXT,
  contact_name    TEXT
)
LANGUAGE SQL STABLE AS $$
  WITH last_msg AS (
    -- Most recent message per conversation (one pass over messages index)
    SELECT DISTINCT ON (conversation_id)
      conversation_id,
      role
    FROM  messages
    ORDER BY conversation_id, timestamp DESC
  )
  SELECT
    c.id            AS conversation_id,
    ct.phone        AS contact_phone,
    ct.name         AS contact_name
  FROM  conversations c
  JOIN  last_msg  m  ON  m.conversation_id = c.id
  JOIN  contacts  ct ON  ct.id = c.contact_id
  WHERE c.tenant_id    = p_tenant_id
    AND c.product_type = p_product_slug
    AND c.status       = 'open'
    AND c.updated_at  <  p_cutoff
    AND m.role         = 'assistant'   -- last message was from bot, not customer
    AND ct.phone      IS NOT NULL
    AND NOT EXISTS (                    -- no voice call already dispatched
      SELECT 1
      FROM   voice_calls v
      WHERE  v.conversation_id = c.id
        AND  v.status IN ('initiated', 'ringing', 'in_progress', 'completed')
    );
$$;
