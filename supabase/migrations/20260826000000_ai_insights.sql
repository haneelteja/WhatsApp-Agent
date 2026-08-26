-- ai_insights: one row per tenant per day
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  generated_at          timestamptz NOT NULL DEFAULT now(),
  suggestions           jsonb NOT NULL DEFAULT '[]',
  dismissed_fingerprints text[] NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_insights_tenant_date
  ON public.ai_insights(tenant_id, generated_at DESC);

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_insights_tenant_read" ON public.ai_insights
  FOR SELECT USING (
    tenant_id = (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1
    )
  );

GRANT ALL ON TABLE public.ai_insights TO service_role;
GRANT SELECT ON TABLE public.ai_insights TO authenticated;
GRANT ALL ON TABLE public.ai_insights TO anon;

-- Add insights schedule config to platform_settings
INSERT INTO public.platform_settings (key, value)
VALUES ('insights', '{"schedule_hour": 9}'::jsonb)
ON CONFLICT (key) DO NOTHING;
