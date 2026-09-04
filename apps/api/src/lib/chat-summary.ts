import { getServerClient } from '@alphabot/database';
import { routedChatCompletion } from './llm-router.js';

/** Update the rolling chat_summary every N turns to keep token cost low. */
const SUMMARISE_EVERY_N_TURNS = 5;

export interface ChatSummary {
  key_facts:          string[];
  sentiment:          'positive' | 'neutral' | 'negative';
  last_intent:        string | null;
  turns_summarized:   number;
  last_summarized_at: string;
}

/**
 * Non-blocking: update conversation chat_summary after every Nth turn.
 * Caller should `void` this — failures are logged but not fatal.
 */
export async function maybeUpdateChatSummary(
  conversationId: string,
  currentSummary:  Record<string, unknown> | null,
  totalTurns:      number,
  lastUserMessage: string,
  lastBotReply:    string,
): Promise<void> {
  const turnsAlreadySummarized = (currentSummary?.['turns_summarized'] as number | undefined) ?? 0;
  const turnsSinceLast = totalTurns - turnsAlreadySummarized;

  if (turnsSinceLast < SUMMARISE_EVERY_N_TURNS) return;

  const db = getServerClient();

  try {
    const existingFacts = (currentSummary?.['key_facts'] as string[] | undefined) ?? [];
    const existingFactsText = existingFacts.length > 0
      ? `Existing key facts:\n${existingFacts.map(f => `- ${f}`).join('\n')}\n\n`
      : '';

    const prompt = `You are summarizing a WhatsApp customer conversation for an AI sales/support assistant.

${existingFactsText}Latest exchange:
Customer: ${lastUserMessage.slice(0, 500)}
Bot: ${lastBotReply.slice(0, 500)}

Return ONLY valid JSON matching this shape (no markdown, no extra text):
{
  "key_facts": ["<up to 5 one-line facts about the customer or their request>"],
  "sentiment": "positive" | "neutral" | "negative",
  "last_intent": "<one-word intent category or null>"
}`;

    const result = await routedChatCompletion({
      messages:   [{ role: 'user', content: prompt }],
      max_tokens: 200,
    });

    let parsed: Partial<ChatSummary>;
    try {
      parsed = JSON.parse(result.content.trim()) as Partial<ChatSummary>;
    } catch {
      return; // malformed JSON — skip silently
    }

    const newSummary: ChatSummary = {
      key_facts:          parsed.key_facts ?? existingFacts,
      sentiment:          parsed.sentiment ?? 'neutral',
      last_intent:        parsed.last_intent ?? null,
      turns_summarized:   totalTurns,
      last_summarized_at: new Date().toISOString(),
    };

    await db
      .from('conversations')
      .update({ chat_summary: newSummary })
      .eq('id', conversationId);
  } catch (err) {
    console.error('[ChatSummary] Failed to update:', err instanceof Error ? err.message : err);
  }
}
