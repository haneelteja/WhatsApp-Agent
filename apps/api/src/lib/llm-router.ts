/**
 * Multi-provider LLM router.
 * Routes chat completion requests to the correct provider API based on the
 * `provider` field. Anthropic uses its native Messages format; OpenAI,
 * OpenRouter, and Custom use the OpenAI-compatible /chat/completions format;
 * Gemini uses the Google Generative Language API.
 */

import { chatCompletion as anthropicCompletion, REPLY_MODEL } from './anthropic.js';
import type { AnthropicMessage } from './anthropic.js';

export interface LlmOverride {
  provider?: string;
  apiKey?:   string;
  model?:    string;
  baseUrl?:  string;
}

export interface CompletionResult {
  content:      string;
  inputTokens:  number;
  outputTokens: number;
}

export async function routedChatCompletion(params: {
  messages:    AnthropicMessage[];
  system?:     string;
  max_tokens?: number;
  override?:   LlmOverride;
}): Promise<CompletionResult> {
  const { messages, system, max_tokens = 512, override } = params;
  const provider = override?.provider ?? 'anthropic';
  const model    = override?.model    ?? REPLY_MODEL;
  const apiKey   = override?.apiKey;

  switch (provider) {
    // ── Anthropic native API ────────────────────────────────────────────────
    case 'anthropic':
      return anthropicCompletion({ model, messages, system, max_tokens, apiKey });

    // ── OpenAI-compatible (OpenAI direct, OpenRouter, Custom endpoint) ──────
    case 'openai':
    case 'openrouter':
    case 'custom': {
      const effectiveKey = apiKey ?? (
        provider === 'openai'     ? process.env['OPENAI_API_KEY'] :
        provider === 'openrouter' ? process.env['OPENROUTER_API_KEY'] :
        undefined
      );
      if (!effectiveKey) throw new Error(`No API key configured for provider: ${provider}`);

      const baseUrl = override?.baseUrl?.replace(/\/$/, '') ?? (
        provider === 'openrouter' ? 'https://openrouter.ai/api/v1' :
        'https://api.openai.com/v1'
      );

      const openaiMessages: { role: string; content: string }[] = [];
      if (system) openaiMessages.push({ role: 'system', content: system });
      openaiMessages.push(...messages.map(m => ({ role: m.role as string, content: m.content })));

      const headers: Record<string, string> = {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${effectiveKey}`,
      };
      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://whats-app-agent-web.vercel.app';
        headers['X-Title']      = 'Alphabot';
      }

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, messages: openaiMessages, max_tokens }),
      });

      if (!res.ok) {
        const body = await res.text();
        let detail = `HTTP ${res.status}`;
        try { const j = JSON.parse(body) as { error?: { message?: string } }; detail = j.error?.message ?? detail; } catch { /* use status */ }
        throw new Error(`${provider} API error ${res.status}: ${detail}`);
      }

      const json = await res.json() as {
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens: number; completion_tokens: number };
      };

      return {
        content:      json.choices[0]?.message.content ?? '',
        inputTokens:  json.usage?.prompt_tokens    ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      };
    }

    // ── Google Gemini ────────────────────────────────────────────────────────
    case 'gemini': {
      const geminiKey = apiKey ?? process.env['GEMINI_API_KEY'];
      if (!geminiKey) throw new Error('No Gemini API key configured. Set GEMINI_API_KEY or configure a client-level key.');

      // Gemini expects alternating user/model turns; inject system prompt as a leading exchange
      const contents: { role: string; parts: { text: string }[] }[] = [];
      if (system) {
        contents.push({ role: 'user',  parts: [{ text: `System instructions: ${system}` }] });
        contents.push({ role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] });
      }
      for (const msg of messages) {
        contents.push({
          role:  msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        });
      }

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: max_tokens },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        let detail = `HTTP ${res.status}`;
        try { const j = JSON.parse(body) as { error?: { message?: string } }; detail = j.error?.message ?? detail; } catch { /* use status */ }
        throw new Error(`Gemini API error ${res.status}: ${detail}`);
      }

      const json = await res.json() as {
        candidates?: Array<{ content: { parts: { text: string }[] } }>;
        usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
      };

      const text = json.candidates?.[0]?.content.parts.map(p => p.text).join('') ?? '';

      return {
        content:      text,
        inputTokens:  json.usageMetadata?.promptTokenCount    ?? 0,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
      };
    }

    default:
      // Unknown provider — fall back to Anthropic env key
      return anthropicCompletion({ model, messages, system, max_tokens, apiKey });
  }
}
