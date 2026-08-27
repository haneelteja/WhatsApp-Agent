CREATE TABLE IF NOT EXISTS public.copilot_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role           text NOT NULL CHECK (role IN ('user', 'assistant')),
  content        text NOT NULL DEFAULT '',
  pending_action jsonb DEFAULT NULL,
  action_status  text CHECK (action_status IN ('pending', 'approved', 'cancelled', 'executed')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS copilot_messages_user_created
  ON public.copilot_messages(user_id, tenant_id, created_at DESC);

ALTER TABLE public.copilot_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copilot_own_messages" ON public.copilot_messages
  FOR ALL USING (user_id = auth.uid());

GRANT ALL ON TABLE public.copilot_messages TO service_role;
GRANT ALL ON TABLE public.copilot_messages TO authenticated;
