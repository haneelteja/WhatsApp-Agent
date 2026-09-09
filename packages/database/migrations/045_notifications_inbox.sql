-- ── In-app notifications inbox ──────────────────────────────────────────────
-- Fires whenever a customer (role='user') sends a message.
-- Powers the topbar bell icon with realtime count + dropdown.

CREATE TABLE IF NOT EXISTS notifications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type            text        NOT NULL DEFAULT 'new_message',
  title           text        NOT NULL,
  body            text,
  conversation_id uuid        REFERENCES conversations(id) ON DELETE CASCADE,
  contact_name    text,
  contact_phone   text,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Full index: used by getNotificationsInboxAction which fetches all (read + unread)
CREATE INDEX IF NOT EXISTS notifications_tenant_created
  ON notifications(tenant_id, created_at DESC);

-- Partial index: used by the trigger dedup EXISTS check (conversation_id, unread only)
CREATE INDEX IF NOT EXISTS notifications_conv_unread
  ON notifications(conversation_id, created_at DESC)
  WHERE read_at IS NULL;

-- RLS: tenants can only see their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_own_notifications"
  ON notifications FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

-- Enable Supabase Realtime so the topbar subscription gets live pushes
ALTER TABLE notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ── Trigger: create a notification on every incoming customer message ────────

CREATE OR REPLACE FUNCTION create_message_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id     uuid;
  v_contact_name  text;
  v_contact_phone text;
  v_product_type  text;
BEGIN
  -- Only for incoming customer messages
  IF NEW.role != 'user' THEN
    RETURN NEW;
  END IF;

  -- Resolve tenant + contact from the conversation
  SELECT
    c.tenant_id,
    c.product_type,
    co.name,
    co.phone
  INTO v_tenant_id, v_product_type, v_contact_name, v_contact_phone
  FROM conversations c
  LEFT JOIN contacts co ON co.id = c.contact_id
  WHERE c.id = NEW.conversation_id;

  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Deduplicate: skip if there is already an unread notification for this
  -- conversation created within the last 15 minutes
  IF EXISTS (
    SELECT 1 FROM notifications
    WHERE conversation_id = NEW.conversation_id
      AND read_at IS NULL
      AND created_at > NOW() - INTERVAL '15 minutes'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (
    tenant_id, type, title, body,
    conversation_id, contact_name, contact_phone
  ) VALUES (
    v_tenant_id,
    'new_message',
    COALESCE(v_contact_name, v_contact_phone, 'Unknown'),
    LEFT(COALESCE(NEW.content, ''), 120),
    NEW.conversation_id,
    v_contact_name,
    v_contact_phone
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_notification ON messages;
CREATE TRIGGER trg_message_notification
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION create_message_notification();
