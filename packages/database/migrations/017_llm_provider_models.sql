-- Model registry: tracks available models per provider, updated weekly by the cron job.
-- Seeds known models immediately so the UI works before the first cron run.

CREATE TABLE IF NOT EXISTS llm_provider_models (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider       text NOT NULL CHECK (provider IN ('anthropic', 'openai', 'gemini', 'openrouter')),
  model_id       text NOT NULL,
  display_name   text,
  context_window integer,
  is_active      boolean NOT NULL DEFAULT true,
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model_id)
);

ALTER TABLE llm_provider_models ENABLE ROW LEVEL SECURITY;

-- Platform managers can read and write; clients can read (to populate their dropdowns)
CREATE POLICY "Platform managers can manage provider models"
  ON llm_provider_models FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM platform_users WHERE user_id = auth.uid()));

CREATE POLICY "Authenticated users can read active models"
  ON llm_provider_models FOR SELECT TO authenticated
  USING (is_active = true);

-- ── Seed ─────────────────────────────────────────────────────────────────────

INSERT INTO llm_provider_models (provider, model_id, display_name, context_window) VALUES
-- Anthropic
('anthropic', 'claude-opus-4-7',            'Claude Opus 4.7',           200000),
('anthropic', 'claude-sonnet-4-6',          'Claude Sonnet 4.6',         200000),
('anthropic', 'claude-haiku-4-5-20251001',  'Claude Haiku 4.5',          200000),
('anthropic', 'claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet',         200000),
('anthropic', 'claude-3-5-haiku-20241022',  'Claude 3.5 Haiku',          200000),
('anthropic', 'claude-3-opus-20240229',     'Claude 3 Opus',             200000),
('anthropic', 'claude-3-haiku-20240307',    'Claude 3 Haiku',            200000),
-- OpenAI
('openai', 'gpt-4o',        'GPT-4o',        128000),
('openai', 'gpt-4o-mini',   'GPT-4o Mini',   128000),
('openai', 'gpt-4-turbo',   'GPT-4 Turbo',   128000),
('openai', 'gpt-4',         'GPT-4',           8192),
('openai', 'gpt-3.5-turbo', 'GPT-3.5 Turbo', 16385),
('openai', 'o1',            'o1',            200000),
('openai', 'o1-mini',       'o1 Mini',       128000),
('openai', 'o3-mini',       'o3 Mini',       200000),
-- Google Gemini
('gemini', 'gemini-2.0-flash',      'Gemini 2.0 Flash',       1000000),
('gemini', 'gemini-2.0-flash-lite', 'Gemini 2.0 Flash Lite',  1000000),
('gemini', 'gemini-1.5-pro',        'Gemini 1.5 Pro',         2000000),
('gemini', 'gemini-1.5-flash',      'Gemini 1.5 Flash',       1000000),
('gemini', 'gemini-1.5-flash-8b',   'Gemini 1.5 Flash 8B',   1000000)
ON CONFLICT (provider, model_id) DO NOTHING;
