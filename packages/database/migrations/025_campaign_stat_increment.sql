-- Migration 025: Atomic campaign stat increment RPC.
-- Replaces the O(N²) pattern where updateCampaignStats() fetches all campaign_contacts
-- after every send. Instead each send atomically increments a single JSONB counter.

CREATE OR REPLACE FUNCTION increment_campaign_stat(
  p_campaign_id UUID,
  p_stat        TEXT    -- 'wa_sent' | 'wa_failed' | 'calls_made' | 'calls_answered' | 'calls_failed'
)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE campaigns
  SET stats = jsonb_set(
    COALESCE(stats, '{}'::jsonb),
    ARRAY[p_stat],
    to_jsonb(COALESCE((stats->p_stat)::int, 0) + 1)
  )
  WHERE id = p_campaign_id;
END;
$$;
