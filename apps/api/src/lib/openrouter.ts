// OpenRouter — single API key that routes to any LLM provider.
// https://openrouter.ai/docs
//
// Model env vars let you swap models without a code deploy:
//   OPENROUTER_REPLY_MODEL   — customer-facing bot replies  (paid, high quality)
//   OPENROUTER_VISION_MODEL  — document image extraction    (free tier, lightweight)

const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Defaults — override via env vars on Render
export const REPLY_MODEL  = process.env['OPENROUTER_REPLY_MODEL']  ?? 'anthropic/claude-3.5-haiku';
export const VISION_MODEL = process.env['OPENROUTER_VISION_MODEL'] ?? 'meta-llama/llama-3.2-11b-vision-instruct:free';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImagePart {
  type:      'image_url';
  image_url: { url: string };   // data URI or https URL
}

export type ContentPart = TextPart | ImagePart;

export interface ChatMessage {
  role:    'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

interface ORResponse {
  choices: Array<{ message: { content: string }; finish_reason: string }>;
  usage:   { prompt_tokens: number; completion_tokens: number };
}

// ── Core function ──────────────────────────────────────────────────────────────

export async function chatCompletion(params: {
  model:       string;
  messages:    ChatMessage[];
  system?:     string;
  max_tokens?: number;
}): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env['OPENROUTER_API_KEY'];
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  const messages: ChatMessage[] = params.system
    ? [{ role: 'system', content: params.system }, ...params.messages]
    : params.messages;

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer':  process.env['WEB_BASE_URL'] ?? 'https://whats-app-agent-web.vercel.app',
      'X-Title':       'Alphabot',
    },
    body: JSON.stringify({
      model:      params.model,
      messages,
      max_tokens: params.max_tokens ?? 1024,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json() as ORResponse;
  return {
    content:      json.choices[0]?.message?.content ?? '',
    inputTokens:  json.usage?.prompt_tokens     ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}
