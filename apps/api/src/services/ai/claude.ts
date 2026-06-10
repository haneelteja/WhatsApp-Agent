import Anthropic from '@anthropic-ai/sdk';
import type { Message, KnowledgeBase } from '@alphabot/shared';

const client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const MAX_CONTEXT_MESSAGES = 50;

export interface AIResponseResult {
  content: string;
  confidenceScore: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Generate a bot reply for a conversation.
 *
 * @param systemPrompt   Business-specific persona + instructions
 * @param history        Last N messages in the conversation (oldest first)
 * @param kbContext      Relevant KB entries to inject as context
 * @param contactMemory  Persistent contact memory (name, order history etc.)
 */
export async function getAIResponse(
  systemPrompt: string,
  history: Message[],
  kbContext: KnowledgeBase[],
  contactMemory?: string
): Promise<AIResponseResult> {
  const contextWindow = history.slice(-MAX_CONTEXT_MESSAGES);

  // Inject KB context + contact memory into the system prompt
  let fullSystemPrompt = systemPrompt;

  if (contactMemory) {
    fullSystemPrompt += `\n\n---\nCONTACT MEMORY (what you know about this customer):\n${contactMemory}`;
  }

  if (kbContext.length > 0) {
    const kbText = kbContext
      .map((e) => `Q: ${e.question}\nA: ${e.answer}`)
      .join('\n\n');
    fullSystemPrompt += `\n\n---\nKNOWLEDGE BASE (use to answer queries accurately):\n${kbText}`;
  }

  const messages = contextWindow.map((m) => ({
    role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
    content: m.content,
  }));

  const response = await client.messages.create({
    model: process.env['AI_MODEL'] ?? DEFAULT_MODEL,
    max_tokens: 1024,
    system: fullSystemPrompt,
    messages,
  });

  const content =
    response.content[0]?.type === 'text' ? response.content[0].text : '';

  // Rough confidence: if model stopped normally and gave a meaningful reply
  const confidenceScore = content.length > 20 && response.stop_reason === 'end_turn' ? 0.9 : 0.5;

  return {
    content,
    confidenceScore,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

/**
 * Generate a vector embedding for KB semantic search.
 * Uses Anthropic's voyage-3 via the Anthropic SDK compatible call.
 * Swap to OpenAI's text-embedding-3-small if preferred.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Claude doesn't expose an embedding endpoint directly — use a lightweight
  // OpenAI-compatible endpoint or Supabase's built-in ai.embed() in SQL.
  // This stub returns zeros and should be replaced with your embedding provider.
  void text;
  return new Array(1536).fill(0) as number[];
}
