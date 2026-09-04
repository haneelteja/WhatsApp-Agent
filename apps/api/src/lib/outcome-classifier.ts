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
    await db.from('conversations').update({
      terminal_outcome: forceOutcome,
      outcome_set_by:   setBy,
      outcome_set_at:   new Date().toISOString(),
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

    await db.from('conversations').update({
      terminal_outcome: outcome,
      outcome_set_by:   'ai',
      outcome_set_at:   new Date().toISOString(),
    }).eq('id', conversationId);
  } catch (err) {
    console.error('[OutcomeClassifier] Failed:', err instanceof Error ? err.message : err);
  }
}
