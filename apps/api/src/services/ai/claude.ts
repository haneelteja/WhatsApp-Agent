import type { Message, KnowledgeBase } from '@alphabot/shared';
import { chatCompletion, REPLY_MODEL } from '../../lib/anthropic.js';
import { heuristicConfidence } from './confidence.js';

const MAX_CONTEXT_MESSAGES = 50;
const MAX_KB_ENTRIES = 3;
const MAX_KB_ANSWER_CHARS = 500;

// Appended to every system prompt — instructs the model to self-report confidence.
// The marker is stripped from the reply before it reaches the customer.
const CONFIDENCE_INSTRUCTION = `

At the very end of your reply (after all content), append exactly one line in this format — no space before it, no explanation:
CONFIDENCE:0.XX
Where 0.XX is your honest 0.0–1.0 self-assessment: 1.0 = fully answered, 0.5 = partially, 0.0 = could not answer. Do not mention this score to the customer.`;

export interface AIResponseResult {
  content:         string;
  confidenceScore: number;
  inputTokens:     number;
  outputTokens:    number;
}

/**
 * Generate a bot reply via the Anthropic API.
 * Confidence is embedded in the response as a CONFIDENCE:0.XX marker,
 * eliminating the need for a second scoring API call.
 */
export async function getAIResponse(
  systemPrompt:   string,
  history:        Message[],
  kbContext:      KnowledgeBase[],
  contactMemory?: string,
  llmOverride?:   { apiKey?: string; model?: string },
): Promise<AIResponseResult> {
  const contextWindow = history.slice(-MAX_CONTEXT_MESSAGES);

  let fullSystemPrompt = systemPrompt + CONFIDENCE_INSTRUCTION;

  if (contactMemory) {
    fullSystemPrompt += `\n\n---\nCONTACT MEMORY (what you know about this customer):\n${contactMemory}`;
  }

  if (kbContext.length > 0) {
    const kbText = kbContext
      .slice(0, MAX_KB_ENTRIES)
      .map(e => `Q: ${e.question}\nA: ${e.answer.slice(0, MAX_KB_ANSWER_CHARS)}`)
      .join('\n\n');
    fullSystemPrompt += `\n\n---\nKNOWLEDGE BASE (use to answer queries accurately):\n${kbText}`;
  }

  const messages = contextWindow.map(m => ({
    role:    m.role === 'user' ? ('user' as const) : ('assistant' as const),
    content: m.content,
  }));

  const model = llmOverride?.model ?? REPLY_MODEL;

  const { content, inputTokens, outputTokens } = await chatCompletion({
    model,
    system:     fullSystemPrompt,
    messages,
    max_tokens: 560, // +48 tokens to accommodate the CONFIDENCE line
    apiKey:     llmOverride?.apiKey,
  });

  // Extract and strip the CONFIDENCE marker from the response
  const { cleanContent, confidenceScore } = extractConfidence(content);

  return { content: cleanContent, confidenceScore, inputTokens, outputTokens };
}

/**
 * Parse the CONFIDENCE:0.XX marker appended by the model.
 * Falls back to heuristic analysis, then 0.85 (never blocks a valid reply).
 */
function extractConfidence(raw: string): { cleanContent: string; confidenceScore: number } {
  const match = raw.match(/\nCONFIDENCE:(0\.\d{1,2}|1\.0+|0)\s*$/);

  if (match) {
    const score = Math.min(1, Math.max(0, parseFloat(match[1]!)));
    const cleanContent = raw.slice(0, raw.lastIndexOf('\nCONFIDENCE:')).trimEnd();
    return { cleanContent, confidenceScore: score };
  }

  // Model didn't emit the marker — fall back to heuristic, then default
  const heuristic = heuristicConfidence(raw);
  return { cleanContent: raw.trimEnd(), confidenceScore: heuristic ?? 0.85 };
}
