-- Enquiry follow-up job queue
-- Scheduled when a new conversation starts; cancelled on [STAGE:booked].
-- Processed every 5 minutes by the scheduler.

CREATE TABLE IF NOT EXISTS enquiry_followup_jobs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id    uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_phone      text NOT NULL,
  whatsapp_number_id uuid REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  fire_at            timestamptz NOT NULL,
  fired_at           timestamptz,
  cancelled_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup for the scheduler: due jobs only
CREATE INDEX enquiry_followup_jobs_due_idx
  ON enquiry_followup_jobs (fire_at)
  WHERE fired_at IS NULL AND cancelled_at IS NULL;

-- One pending job per conversation (prevent duplicate scheduling on retries)
CREATE UNIQUE INDEX enquiry_followup_jobs_conv_pending_idx
  ON enquiry_followup_jobs (conversation_id)
  WHERE fired_at IS NULL AND cancelled_at IS NULL;

-- RLS: service role only (accessed via server client)
ALTER TABLE enquiry_followup_jobs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON enquiry_followup_jobs TO service_role;
