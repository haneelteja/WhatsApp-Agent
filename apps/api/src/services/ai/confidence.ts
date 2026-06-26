import { chatCompletion, REPLY_MODEL } from '../../lib/anthropic.js';

/**
 * Score how well an AI response answers a user's question.
 * Returns a value 0.0–1.0. Falls back to 0.85 on any error so a scoring
 * failure never blocks a valid reply from reaching the customer.
 *
 * Uses a dedicated cheap/fast call (Haiku, max 4 tokens) so cost is negligible.
 */
export async function scoreResponseConfidence(
  userQuestion:  string,
  aiResponse:    string,
  apiKey?:       string,
  model?:        string,
): Promise<number> {
  if (!userQuestion.trim() || !aiResponse.trim()) return 0.5;

  try {
    const { content } = await chatCompletion({
      model:      model ?? REPLY_MODEL,
      apiKey,
      max_tokens: 4,
      system:     'You score AI responses. Reply with ONLY a decimal number from 0.0 to 1.0. 1.0 = fully answers the question. 0.5 = partial or vague. 0.0 = does not answer or is wrong.',
      messages: [{
        role:    'user',
        content: `Question: ${userQuestion.slice(0, 300)}\n\nResponse: ${aiResponse.slice(0, 500)}\n\nScore:`,
      }],
    });

    const score = parseFloat(content.trim());
    if (isNaN(score) || score < 0 || score > 1) return 0.85;
    return Math.round(score * 100) / 100;

  } catch {
    return 0.85;
  }
}

/**
 * Heuristic pre-filter: quickly detect obvious low-confidence signals
 * without an API call. Used as a fast-path to skip the scoring call
 * when the response already signals uncertainty.
 */
export function heuristicConfidence(response: string): number | null {
  const lower = response.toLowerCase();

  const highUncertaintyPhrases = [
    "i don't know", "i do not know", "i'm not sure", "i am not sure",
    "i cannot answer", "i can't answer", "i don't have information",
    "i don't have that information", "i'm unable to", "i am unable to",
    "please contact", "please speak to", "i'll connect you",
  ];

  const partialUncertaintyPhrases = [
    "i'm not certain", "i believe", "i think", "as far as i know",
    "you may want to verify", "i'd recommend checking",
  ];

  if (highUncertaintyPhrases.some(p => lower.includes(p))) return 0.3;
  if (partialUncertaintyPhrases.some(p => lower.includes(p))) return 0.6;

  return null; // no heuristic signal — use the API scorer
}
