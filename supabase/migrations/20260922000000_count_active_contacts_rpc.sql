-- RPC: count distinct contacts with conversations in the last N days
CREATE OR REPLACE FUNCTION count_active_contacts(p_tenant_id UUID, p_days INT)
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT COUNT(DISTINCT contact_id)
  FROM conversations
  WHERE tenant_id = p_tenant_id
    AND updated_at >= now() - (p_days || ' days')::INTERVAL
    AND contact_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION count_active_contacts TO service_role;
