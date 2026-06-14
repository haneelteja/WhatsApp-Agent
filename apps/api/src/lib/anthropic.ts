// Anthropic Messages API — direct integration (no OpenRouter proxy).
// Default model: claude-3-5-haiku-20241022 (fast, cheap, high quality).
// Override via ANTHROPIC_MODEL env var without a code deploy.

const BASE_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export const REPLY_MODEL = process.env['ANTHROPIC_MODEL'] ?? 'claude-haiku-4-5-20251001';

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
  error?: { message: string };
}

export async function chatCompletion(params: {
  model:       string;
  messages:    AnthropicMessage[];
  system?:     string;
  max_tokens?: number;
  apiKey?:     string;
}): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const apiKey = params.apiKey ?? process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('No Anthropic API key configured. Set ANTHROPIC_API_KEY in environment variables.');

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify({
      model:      params.model,
      max_tokens: params.max_tokens ?? 1024,
      ...(params.system ? { system: params.system } : {}),
      messages:   params.messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    let detail = body.slice(0, 400);
    try {
      const j = JSON.parse(body) as AnthropicResponse;
      detail = j?.error?.message ?? detail;
    } catch { /* use raw body */ }
    throw new Error(`Anthropic API error ${res.status}: ${detail}`);
  }

  const json = await res.json() as AnthropicResponse;
  return {
    content:      json.content.find(b => b.type === 'text')?.text ?? '',
    inputTokens:  json.usage.input_tokens,
    outputTokens: json.usage.output_tokens,
  };
}
