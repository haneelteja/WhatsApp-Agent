-- Migration 036: Scheduled Messages
-- Allows tenants to schedule outbound WhatsApp messages to one or many contacts,
-- with optional recurrence, session-aware delivery (freeform vs template),
-- and optional bot reply handling.

-- ─── Main schedule table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                text        NOT NULL,
  message_body        text,
  template_name       text,
  template_language   text        NOT NULL DEFAULT 'en',
  template_components jsonb       NOT NULL DEFAULT '[]',
  scheduled_at        timestamptz NOT NULL,
  recurrence          jsonb       NOT NULL DEFAULT '{"type":"once"}',
  bot_handles_replies boolean     NOT NULL DEFAULT false,
  status              text        NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('draft','scheduled','running','completed','cancelled','failed')),
  failure_reason      text,
  created_by          uuid        REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── Per-recipient send log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scheduled_message_recipients (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_message_id   uuid        NOT NULL REFERENCES public.scheduled_messages(id) ON DELETE CASCADE,
  tenant_id              uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone                  text        NOT NULL,
  contact_name           text,
  contact_id             uuid        REFERENCES public.contacts(id),
  session_status         text        CHECK (session_status IN ('active','expired','unknown')),
  message_type           text        CHECK (message_type IN ('freeform','template')),
  status                 text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','delivered','read','failed','skipped')),
  whatsapp_message_id    text,
  conversation_id        uuid        REFERENCES public.conversations(id),
  error_message          text,
  sent_at                timestamptz,
  delivered_at           timestamptz,
  read_at                timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS scheduled_messages_tenant_status
  ON public.scheduled_messages(tenant_id, status);
CREATE INDEX IF NOT EXISTS scheduled_messages_fire_time
  ON public.scheduled_messages(scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS scheduled_message_recipients_msg_id
  ON public.scheduled_message_recipients(scheduled_message_id);
CREATE INDEX IF NOT EXISTS scheduled_message_recipients_tenant
  ON public.scheduled_message_recipients(tenant_id);

-- ─── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_scheduled_messages_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER scheduled_messages_updated_at
  BEFORE UPDATE ON public.scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_scheduled_messages_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.scheduled_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_message_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduled_messages_tenant_read" ON public.scheduled_messages
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  );
CREATE POLICY "scheduled_messages_tenant_write" ON public.scheduled_messages
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "scheduled_message_recipients_tenant_read" ON public.scheduled_message_recipients
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  );

GRANT ALL    ON TABLE public.scheduled_messages           TO service_role;
GRANT SELECT ON TABLE public.scheduled_messages           TO authenticated;
GRANT ALL    ON TABLE public.scheduled_message_recipients TO service_role;
GRANT SELECT ON TABLE public.scheduled_message_recipients TO authenticated;
