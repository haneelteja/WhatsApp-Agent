-- Batch update for lead follow-up counts (replaces N serial UPDATE round-trips)
CREATE OR REPLACE FUNCTION batch_update_lead_followup_count(
  p_ids        UUID[],
  p_counts     INT[],
  p_updated_at TIMESTAMPTZ
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE conversations
  SET    lead_follow_up_count = data.cnt,
         updated_at           = p_updated_at
  FROM   unnest(p_ids, p_counts) AS data(id, cnt)
  WHERE  conversations.id = data.id;
$$;

GRANT EXECUTE ON FUNCTION batch_update_lead_followup_count TO postgres, anon, authenticated, service_role;

-- Hot path: inbound webhook contact lookup (tenant_id + phone on every message)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_tenant_phone
  ON contacts (tenant_id, phone);

-- Hot path: follow-up / lifecycle scheduler conversation queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_tenant_status_created
  ON conversations (tenant_id, status, created_at DESC);

-- Hot path: copilot message history loaded in dashboard layout
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_copilot_messages_user_tenant_created
  ON copilot_messages (user_id, tenant_id, created_at DESC);

-- Webhook dedup log check (30-day window query, status = 'sent' filter)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_logs_tenant_phone_status
  ON webhook_logs (tenant_id, contact_phone, status, triggered_at DESC)
  WHERE status = 'sent';
