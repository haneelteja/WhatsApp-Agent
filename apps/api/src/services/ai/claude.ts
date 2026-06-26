import type { Message, KnowledgeBase } from '@alphabot/shared';
import { chatCompletion, REPLY_MODEL } from '../../lib/anthropic.js';
import { heuristicConfidence, scoreResponseConfidence } from './confidence.js';

const MAX_CONTEXT_MESSAGES = 50;
const MAX_KB_ENTRIES = 3;
const MAX_KB_ANSWER_CHARS = 500;

export interface AIResponseResult {
  content:         string;
  confidenceScore: number;
  inputTokens:     number;
  outputTokens:    number;
}

/**
 * Generate a bot reply for a conversation via OpenRouter.
 * Model is controlled by OPENROUTER_REPLY_MODEL env var (default: anthropic/claude-3.5-haiku).
 * Swap to any OpenRouter-supported model without a code change.
 */
export async function getAIResponse(
  systemPrompt:   string,
  history:        Message[],
  kbContext:      KnowledgeBase[],
  contactMemory?: string,
  llmOverride?:   { apiKey?: string; model?: string },
): Promise<AIResponseResult> {
  const contextWindow = history.slice(-MAX_CONTEXT_MESSAGES);

  let fullSystemPrompt = systemPrompt;

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
    max_tokens: 512,
    apiKey:     llmOverride?.apiKey,
  });

  // Score confidence: heuristic first (free), API call only if no clear signal
  const heuristic = heuristicConfidence(content);
  const confidenceScore = heuristic !== null
    ? heuristic
    : await scoreResponseConfidence(
        // Last user message is the most recent question being answered
        history.filter(m => m.role === 'user').at(-1)?.content ?? '',
        content,
        llmOverride?.apiKey,
        model,
      );

  return { content, confidenceScore, inputTokens, outputTokens };
}
