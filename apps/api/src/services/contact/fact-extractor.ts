/**
 * Real-time contact fact extraction.
 *
 * After each AI reply, extract structured facts about the customer from the
 * latest exchange and persist them to contacts.memory_json.live_facts so the
 * bot has richer context on the very next turn.
 *
 * This runs fire-and-forget — never blocks the reply pipeline.
 */

import { getServerClient } from '@alphabot/database';
import { chatCompletion, REPLY_MODEL } from '../../lib/anthropic.js';

interface LiveFacts {
  name?:                string;
  city?:                string;
  occasion?:            string;
  product_preference?:  string;
  order_reference?:     string;
  dietary_restriction?: string;
  budget?:              string;
  [key: string]:        string | undefined;
}

interface ContactMemoryJson {
  live_facts?:          LiveFacts;
  past_conversations?:  unknown[];
  awaiting_csat?:       boolean;
  csat_score?:          number;
  sentiment?:           string;
  [key: string]:        unknown;
}

const EXTRACTION_PROMPT = `You extract structured customer facts from a single WhatsApp exchange.

Respond with ONLY valid JSON (no markdown). Extract any of these fields if clearly stated:
{
  "name":                "<customer's first name if mentioned>",
  "city":                "<city or location if mentioned>",
  "occasion":            "<event/occasion if mentioned, e.g. birthday, anniversary>",
  "product_preference":  "<specific product or category preference>",
  "order_reference":     "<order number or reference if mentioned>",
  "dietary_restriction": "<diet restriction if mentioned, e.g. vegan, nut allergy>",
  "budget":              "<budget range if mentioned>"
}

Rules:
- Only include fields where the value is EXPLICITLY stated, not inferred
- If no facts are extractable, respond with {}
- Keep values short (under 80 chars)
- Do not include the bot's words as facts — only the customer's`;

/**
 * Extract facts from the latest customer message + bot reply, then merge into
 * contacts.memory_json.live_facts. Idempotent: never overwrites existing values
 * with empty strings; only adds or updates.
 */
export async function extractAndMergeFacts(
  contactId:    string,
  customerText: string,
  botReply:     string,
  existingMemory: Record<string, unknown> | null,
): Promise<void> {
  if (!customerText.trim()) return;

  let extracted: LiveFacts = {};
  try {
    const { content } = await chatCompletion({
      model:      REPLY_MODEL,
      max_tokens: 150,
      system:     EXTRACTION_PROMPT,
      messages: [{
        role:    'user',
        content: `Customer: ${customerText.slice(0, 400)}\nBot: ${botReply.slice(0, 200)}`,
      }],
    });

    const clean = content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    extracted = JSON.parse(clean) as LiveFacts;
  } catch {
    return; // extraction failed — non-fatal
  }

  // Only persist if something was actually extracted
  const nonEmpty = Object.entries(extracted).filter(([, v]) => v && String(v).trim());
  if (nonEmpty.length === 0) return;

  const db = getServerClient();
  const existing = (existingMemory ?? {}) as ContactMemoryJson;
  const currentFacts = (existing.live_facts ?? {}) as LiveFacts;

  // Merge: new values win only when they are non-empty
  const merged: LiveFacts = { ...currentFacts };
  for (const [k, v] of nonEmpty) {
    if (v) merged[k] = v;
  }

  await db.from('contacts')
    .update({ memory_json: { ...existing, live_facts: merged } })
    .eq('id', contactId);
}
