-- Knowledge base answer feedback
-- Lets client managers flag poor bot answers from the conversation view
-- so they can review and improve the KB.

CREATE TABLE IF NOT EXISTS kb_feedback (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID        NOT NULL,
  message_id      UUID        NOT NULL,
  message_content TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'reviewed', 'resolved')),
  resolution_note TEXT,
  flagged_by      UUID,       -- auth.users id of who flagged it
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kb_feedback_tenant_id_idx    ON kb_feedback(tenant_id);
CREATE INDEX IF NOT EXISTS kb_feedback_status_idx       ON kb_feedback(tenant_id, status);
CREATE INDEX IF NOT EXISTS kb_feedback_conversation_idx ON kb_feedback(conversation_id);

-- RLS: tenants see only their own feedback
ALTER TABLE kb_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY kb_feedback_tenant_select ON kb_feedback
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
  );

CREATE POLICY kb_feedback_tenant_insert ON kb_feedback
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
  );

CREATE POLICY kb_feedback_tenant_update ON kb_feedback
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()
    )
  );

-- Updated-at trigger
CREATE OR REPLACE FUNCTION update_kb_feedback_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER kb_feedback_updated_at
  BEFORE UPDATE ON kb_feedback
  FOR EACH ROW EXECUTE FUNCTION update_kb_feedback_updated_at();
