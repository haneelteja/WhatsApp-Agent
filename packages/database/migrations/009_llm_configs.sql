-- 009_llm_configs.sql
-- Multi-level LLM configuration (API key + model) with a 4-level hierarchy:
--   Platform Generic:  tenant_id IS NULL,  product_slug IS NULL
--   Platform Bot-type: tenant_id IS NULL,  product_slug = 'support_bot' | 'sales_bot' | 'lifecycle_bot'
--   Client Generic:    tenant_id = <uuid>, product_slug IS NULL
--   Client Bot:        tenant_id = <uuid>, product_slug = 'support_bot' | ...
--
-- Resolution (webhook): Client Bot → Client Generic → Platform Bot → Platform Generic → env vars

CREATE TABLE IF NOT EXISTS llm_configs (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Scope (NULL = applies to all at that level)
  tenant_id         uuid        REFERENCES tenants(id) ON DELETE CASCADE,
  product_slug      text,

  -- LLM provider + credentials
  provider          text        NOT NULL DEFAULT 'openrouter',
  api_key           text        NOT NULL,
  model             text        NOT NULL,
  base_url          text,                 -- optional override for custom/self-hosted endpoints

  -- Validation state
  validation_status text        NOT NULL DEFAULT 'pending'
                                CHECK (validation_status IN ('pending', 'valid', 'invalid')),
  validation_error  text,
  validated_at      timestamptz,
  credit_info       jsonb,                -- {usage, limit, is_free_tier} populated by OpenRouter /auth/key

  -- Audit
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,

  -- One config per scope level (NULLs treated as equal — only one platform-generic row)
  UNIQUE NULLS NOT DISTINCT (tenant_id, product_slug)
);

ALTER TABLE llm_configs ENABLE ROW LEVEL SECURITY;

-- Platform/service role: full access
CREATE POLICY "service_role_all_llm_configs" ON llm_configs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated client users: read own tenant configs + platform-level configs
CREATE POLICY "tenant_users_read_llm_configs" ON llm_configs
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );
