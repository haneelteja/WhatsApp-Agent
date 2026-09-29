-- Migration 048: Hard/soft outcome scores per conversation
-- Adds the SkillOpt-inspired dual-metric framework:
--   outcome_hard  — binary success (1 = good outcome, 0 = failure)
--   outcome_soft  — continuous quality 0.0–1.0 (encodes how close to success even in failure cases)
-- Both are computed by the API when terminal_outcome is set and can be queried
-- by analytics, the failure analysis job, and future bot-optimization features.

alter table conversations
  add column if not exists outcome_hard smallint
    check (outcome_hard in (0, 1)),
  add column if not exists outcome_soft float4
    check (outcome_soft >= 0.0 and outcome_soft <= 1.0);

-- Index for the failure analysis job: quickly find failed conversations per tenant
create index if not exists idx_conv_outcome_hard
  on conversations(tenant_id, product_type, outcome_hard, created_at desc)
  where outcome_hard is not null;

-- Index for analytics: open/in-progress conversations with a soft score from lead scoring
create index if not exists idx_conv_outcome_soft
  on conversations(tenant_id, outcome_soft)
  where outcome_soft is not null;
