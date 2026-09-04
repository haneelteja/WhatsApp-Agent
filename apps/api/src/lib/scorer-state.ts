import { createHash } from 'crypto';
import { getServerClient } from '@alphabot/database';

export interface ScorerParams {
  mean_score:    number;   // average lead score for converted outcomes
  sample_count:  number;
  conversion_rate: number; // converted / total outcomes with verdicts
}

/**
 * Returns cached scorer params if the evidence fingerprint matches.
 * If the fingerprint has changed (new outcomes recorded), refits and caches.
 * Fingerprint = sha256(sorted outcome verdicts) — changes only when training data changes.
 */
export async function getScorerForBot(
  tenantId:    string,
  productSlug: string,
): Promise<ScorerParams> {
  const db = getServerClient();

  // Fetch all terminal outcomes for this bot
  const { data: rows } = await db
    .from('conversations')
    .select('terminal_outcome, lead_score')
    .eq('tenant_id', tenantId)
    .eq('product_type', productSlug)
    .not('terminal_outcome', 'is', null);

  const outcomes = (rows ?? []) as Array<{ terminal_outcome: string; lead_score: number | null }>;

  // Compute fingerprint from the sorted outcome list
  const fingerprintSource = outcomes
    .map(o => `${o.terminal_outcome}:${o.lead_score ?? 0}`)
    .sort()
    .join('|');
  const fingerprint = createHash('sha256').update(fingerprintSource).digest('hex');

  // Check cache
  const { data: cached } = await db
    .from('bot_scorer_state')
    .select('evidence_fingerprint, model_params')
    .eq('tenant_id', tenantId)
    .eq('product_slug', productSlug)
    .maybeSingle();

  if (cached && (cached as { evidence_fingerprint: string }).evidence_fingerprint === fingerprint) {
    return (cached as { model_params: ScorerParams }).model_params as ScorerParams;
  }

  // Refit
  const converted = outcomes.filter(o => o.terminal_outcome === 'converted');
  const total      = outcomes.length;
  const convScores = converted.map(o => o.lead_score ?? 0);
  const meanScore  = convScores.length > 0
    ? convScores.reduce((a, b) => a + b, 0) / convScores.length
    : 50;

  const params: ScorerParams = {
    mean_score:      Math.round(meanScore),
    sample_count:    total,
    conversion_rate: total > 0 ? converted.length / total : 0,
  };

  // Upsert cache
  await db.from('bot_scorer_state').upsert(
    {
      tenant_id:            tenantId,
      product_slug:         productSlug,
      evidence_fingerprint: fingerprint,
      model_params:         params,
      trained_at:           new Date().toISOString(),
      sample_count:         total,
    },
    { onConflict: 'tenant_id,product_slug' },
  );

  return params;
}
