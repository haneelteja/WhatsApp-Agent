import { getServerClient } from '@alphabot/database';
import { routedChatCompletion } from './llm-router.js';

export type ConversationOutcome =
  | 'converted'
  | 'not_interested'
  | 'wrong_fit'
  | 'no_budget'
  | 'has_solution'
  | 'bad_timing'
  | 'unresponsive'
  | 'opted_out'
  | 'undeliverable';

const VALID_OUTCOMES = new Set<ConversationOutcome>([
  'converted','not_interested','wrong_fit','no_budget',
  'has_solution','bad_timing','unresponsive','opted_out','undeliverable',
]);

// ── Hard/soft score mapping (SkillOpt dual-metric framework) ──────────────────
// outcome_hard: 1 = successful outcome, 0 = failure
// outcome_soft: 0.0–1.0 quality proxy — even failures encode how close to success
const OUTCOME_HARD: Record<ConversationOutcome, number> = {
  converted:      1,
  bad_timing:     0,
  not_interested: 0,
  wrong_fit:      0,
  no_budget:      0,
  has_solution:   0,
  unresponsive:   0,
  opted_out:      0,
  undeliverable:  0,
};

const OUTCOME_SOFT: Record<ConversationOutcome, number> = {
  converted:      1.0,  // full success
  bad_timing:     0.6,  // interested, just not now — partial credit
  has_solution:   0.4,  // engaged enough to explain their situation
  no_budget:      0.35, // engaged, budget mismatch
  not_interested: 0.2,  // explicit rejection — at least we got a clear signal
  wrong_fit:      0.2,  // qualification failure
  unresponsive:   0.15, // went silent — unclear signal
  opted_out:      0.0,  // negative signal
  undeliverable:  0.0,  // channel failure
};

export function computeOutcomeScores(
  outcome: ConversationOutcome,
  leadScore?: number | null,
): { hard: number; soft: number } {
  const hard = OUTCOME_HARD[outcome];
  let soft   = OUTCOME_SOFT[outcome];
  // For converted conversations, blend in the lead score if available so higher-value
  // conversions score higher than minimum-threshold conversions.
  if (hard === 1 && leadScore != null && leadScore > 0) {
    soft = Math.min(1.0, 0.7 + (leadScore / 100) * 0.3);
  }
  return { hard, soft };
}

/**
 * Classifies why a conversation closed.
 * Called non-blocking when a conversation transitions to a terminal state
 * (resolved, closed, or after 3 unanswered follow-ups).
 */
export async function classifyAndPersistOutcome(
  conversationId: string,
  setBy: 'ai' | 'human' | 'system',
  forceOutcome?: ConversationOutcome,
): Promise<void> {
  const db = getServerClient();

  // If outcome is forced (e.g. system detects opt-out), persist directly
  if (forceOutcome) {
    const { hard, soft } = computeOutcomeScores(forceOutcome);
    await db.from('conversations').update({
      terminal_outcome: forceOutcome,
      outcome_set_by:   setBy,
      outcome_set_at:   new Date().toISOString(),
      outcome_hard:     hard,
      outcome_soft:     soft,
    }).eq('id', conversationId);
    return;
  }

  try {
    // Fetch the last 6 messages for classification context
    const { data: msgs } = await db
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false })
      .limit(6);

    if (!msgs?.length) return;

    const transcript = (msgs as Array<{ role: string; content: string }>)
      .reverse()
      .map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.content.slice(0, 200)}`)
      .join('\n');

    const prompt = `Classify why this WhatsApp sales conversation ended. Reply with EXACTLY one word from this list:
converted, not_interested, wrong_fit, no_budget, has_solution, bad_timing, unresponsive, opted_out, undeliverable

Definitions:
- converted: customer agreed to buy / placed order
- not_interested: explicitly said no or not interested
- wrong_fit: customer's needs don't match our offering
- no_budget: customer has insufficient budget right now
- has_solution: customer already has a competing solution
- bad_timing: interested but not right now ("call me next month")
- unresponsive: conversation went silent / customer stopped replying
- opted_out: customer asked to stop receiving messages
- undeliverable: messages could not be delivered

Conversation:
${transcript}

Reply with one word only:`;

    const result = await routedChatCompletion({
      messages:   [{ role: 'user', content: prompt }],
      max_tokens: 10,
    });

    const raw = result.content.trim().toLowerCase() as ConversationOutcome;
    const outcome = VALID_OUTCOMES.has(raw) ? raw : 'unresponsive';

    // Fetch lead_score to blend into soft score for converted outcomes
    const { data: conv } = await db
      .from('conversations')
      .select('lead_score')
      .eq('id', conversationId)
      .maybeSingle();
    const leadScore = (conv as { lead_score?: number | null } | null)?.lead_score ?? null;
    const { hard, soft } = computeOutcomeScores(outcome, leadScore);

    await db.from('conversations').update({
      terminal_outcome: outcome,
      outcome_set_by:   'ai',
      outcome_set_at:   new Date().toISOString(),
      outcome_hard:     hard,
      outcome_soft:     soft,
    }).eq('id', conversationId);
  } catch (err) {
    console.error('[OutcomeClassifier] Failed:', err instanceof Error ? err.message : err);
  }
}
