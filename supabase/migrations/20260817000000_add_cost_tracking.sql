-- ─── Cost tracking: per-event INR columns on usage_events ───────────────────
-- Adds split token counts + computed cost in INR so the billing dashboard can
-- show "₹X spent this month" without a separate API call.

ALTER TABLE usage_events
  ADD COLUMN IF NOT EXISTS input_tokens  INTEGER,
  ADD COLUMN IF NOT EXISTS output_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS cost_inr      NUMERIC(12, 6);

-- ─── Add cost accumulator to the monthly aggregate table ─────────────────────
ALTER TABLE tenant_token_usage_monthly
  ADD COLUMN IF NOT EXISTS cost_inr_month NUMERIC(12, 4) NOT NULL DEFAULT 0;

-- ─── Update trigger to also accumulate cost_inr ──────────────────────────────
CREATE OR REPLACE FUNCTION fn_increment_token_usage()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO tenant_token_usage_monthly (tenant_id, month, tokens_used, cost_inr_month)
  VALUES (
    NEW.tenant_id,
    date_trunc('month', NEW.created_at)::DATE,
    COALESCE(NEW.token_count, 0),
    COALESCE(NEW.cost_inr, 0)
  )
  ON CONFLICT (tenant_id, month)
  DO UPDATE SET
    tokens_used     = tenant_token_usage_monthly.tokens_used     + EXCLUDED.tokens_used,
    cost_inr_month  = tenant_token_usage_monthly.cost_inr_month  + EXCLUDED.cost_inr_month;
  RETURN NEW;
END;
$$;

-- Trigger definition is unchanged (same table/condition) — recreate to pick up
-- the updated function body.
DROP TRIGGER IF EXISTS trg_increment_token_usage ON usage_events;
CREATE TRIGGER trg_increment_token_usage
  AFTER INSERT ON usage_events
  FOR EACH ROW
  WHEN (NEW.event_type = 'ai_token_used' AND NEW.tenant_id IS NOT NULL)
  EXECUTE FUNCTION fn_increment_token_usage();
