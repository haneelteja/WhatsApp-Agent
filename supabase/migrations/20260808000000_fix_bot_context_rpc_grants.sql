-- ─── Fix get_bot_context RPC permissions ──────────────────────────────────────
-- The SECURITY DEFINER function was failing with "permission denied for table
-- bot_type_guardrails" and "tenant_guardrails" because those tables lacked
-- explicit GRANTs to the postgres role that owns the function.
-- Also re-creates the function with SET search_path to prevent search_path injection.

-- Grant SELECT on all tables the RPC reads
GRANT SELECT ON bot_type_guardrails  TO postgres, service_role;
GRANT SELECT ON tenant_guardrails    TO postgres, service_role;
GRANT SELECT ON platform_settings    TO postgres, service_role;
GRANT SELECT ON whatsapp_numbers     TO postgres, service_role;
GRANT SELECT ON tenants              TO postgres, service_role;
GRANT SELECT ON bot_configs          TO postgres, service_role;
GRANT SELECT ON products             TO postgres, service_role;
GRANT SELECT ON llm_configs          TO postgres, service_role;

-- Re-create with explicit search_path so the SECURITY DEFINER function
-- cannot be exploited via search_path injection.
CREATE OR REPLACE FUNCTION get_bot_context(
  p_tenant_id    UUID,
  p_product_slug TEXT,
  p_provider     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'whatsapp_number', (
      SELECT row_to_json(wn)
      FROM whatsapp_numbers wn
      WHERE wn.tenant_id    = p_tenant_id
        AND wn.product_slug = p_product_slug
        AND wn.provider     = p_provider
        AND wn.active       = true
      LIMIT 1
    ),
    'tenant', (
      SELECT row_to_json(t)
      FROM tenants t
      WHERE t.id = p_tenant_id
    ),
    'bot_config', (
      SELECT jsonb_build_object(
        'id',                   bc.id,
        'system_prompt',        bc.system_prompt,
        'ai_model',             bc.ai_model,
        'confidence_threshold', bc.confidence_threshold,
        'escalation_triggers',  bc.escalation_triggers,
        'guardrails_json',      bc.guardrails_json,
        'escalation_policy',    bc.escalation_policy,
        'default_prompt',       p.default_prompt,
        'default_model',        p.default_model
      )
      FROM bot_configs bc
      LEFT JOIN products p ON p.id = bc.product_id
      WHERE bc.tenant_id    = p_tenant_id
        AND bc.product_slug = p_product_slug
      LIMIT 1
    ),
    'platform_guardrails', (
      SELECT value
      FROM platform_settings
      WHERE key = 'guardrails'
      LIMIT 1
    ),
    'bot_type_guardrails', (
      SELECT guardrails_json
      FROM bot_type_guardrails
      WHERE product_slug = p_product_slug
      LIMIT 1
    ),
    'tenant_guardrails', (
      SELECT guardrails_json
      FROM tenant_guardrails
      WHERE tenant_id = p_tenant_id
      LIMIT 1
    ),
    'llm_configs', (
      SELECT jsonb_agg(row_to_json(lc))
      FROM llm_configs lc
      WHERE (lc.tenant_id IS NULL OR lc.tenant_id = p_tenant_id)
        AND (lc.product_slug IS NULL OR lc.product_slug = p_product_slug)
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- Allow the API (service_role) to call the function
GRANT EXECUTE ON FUNCTION get_bot_context(UUID, TEXT, TEXT) TO service_role;
