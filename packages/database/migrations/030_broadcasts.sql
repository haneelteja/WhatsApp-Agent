-- ============================================================================
-- Broadcast messages
--
-- Clients send a single message to a segment of contacts:
--   all, recent_7d, recent_10d, or one/more contact groups.
-- Broadcasts can be immediate (scheduled_at IS NULL) or scheduled.
-- ============================================================================

CREATE TABLE IF NOT EXISTS broadcast_messages (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           TEXT         NOT NULL,
  message        TEXT         NOT NULL,
  audience_type  TEXT         NOT NULL CHECK (audience_type IN ('all', 'recent_7d', 'recent_10d', 'groups')),
  group_ids      UUID[]       NOT NULL DEFAULT '{}',
  scheduled_at   TIMESTAMPTZ,                       -- NULL = send immediately on creation
  status         TEXT         NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  total_count    INT          NOT NULL DEFAULT 0,
  sent_count     INT          NOT NULL DEFAULT 0,
  failed_count   INT          NOT NULL DEFAULT 0,
  error_message  TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'broadcast_messages_updated_at') THEN
    CREATE TRIGGER broadcast_messages_updated_at
      BEFORE UPDATE ON broadcast_messages
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_broadcast_tenant    ON broadcast_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_status    ON broadcast_messages(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_scheduled ON broadcast_messages(scheduled_at) WHERE status = 'scheduled';

ALTER TABLE broadcast_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "broadcast_messages: read own" ON broadcast_messages
  FOR SELECT USING (tenant_id = get_user_tenant_id());
