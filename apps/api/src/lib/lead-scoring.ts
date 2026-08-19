import type { FastifyBaseLogger } from 'fastify';
import { getServerClient } from '@alphabot/database';
import { routedChatCompletion } from './llm-router.js';

/**
 * Heuristic lead score 0-100 based on the entities the AI captured.
 * Points are awarded for each signal category present in ai_vars keys.
 */
export function calcLeadScore(aiVars: Record<string, string>, stage: string): number {
  const keys = Object.keys(aiVars).map(k => k.toLowerCase());
  let score = 0;

  // Product interest (+20)
  if (keys.some(k =>
    k.includes('product') || k.includes('item') || k.includes('interest') ||
    k.includes('tank') || k.includes('pump') || k.includes('want') || k.includes('need'),
  )) {
    score += 20;
  } else if (keys.length >= 1) {
    score += 8; // some entity captured, partial credit
  }

  // Quantity (+20)
  if (keys.some(k =>
    k.includes('qty') || k.includes('quantity') || k.includes('volume') ||
    k.includes('unit') || k.includes('liter') || k.includes('litre') ||
    k.includes('amount') || k.includes('number') || k.includes('pieces'),
  )) score += 20;

  // Budget (+15)
  if (keys.some(k =>
    k.includes('budget') || k.includes('price') || k.includes('cost') ||
    k.includes('value') || k.includes('spend') || k.includes('inr') ||
    k.includes('rupee') || k.includes('payment'),
  )) score += 15;

  // Timeline (+15)
  if (keys.some(k =>
    k.includes('time') || k.includes('date') || k.includes('deliver') ||
    k.includes('urgent') || k.includes('deadline') || k.includes('when') ||
    k.includes('schedule') || k.includes('asap'),
  )) score += 15;

  // Location (+10)
  if (keys.some(k =>
    k.includes('location') || k.includes('address') || k.includes('city') ||
    k.includes('area') || k.includes('pin') || k.includes('state') ||
    k.includes('district') || k.includes('village'),
  )) score += 10;

  // Contact info (+10)
  if (keys.some(k =>
    k.includes('name') || k.includes('company') || k.includes('firm') ||
    k.includes('business') || k.includes('email') || k.includes('contact'),
  )) score += 10;

  // Stage bonus
  const stageBonuses: Record<string, number> = { closing: 10, following_up: 5, resolving: 3 };
  score += stageBonuses[stage] ?? 0;

  return Math.min(100, score);
}

/**
 * Calls Claude to produce a 5-line handoff summary and persists it on the escalation row.
 * Runs fire-and-forget — caller should `void` this.
 */
export async function generateLeadSummary(
  escalationId: string,
  conversationId: string,
  aiVars: Record<string, string>,
  stage: string,
  log: FastifyBaseLogger,
): Promise<void> {
  const db = getServerClient();

  try {
    // Fetch contact via conversation join
    const { data: conv } = await db
      .from('conversations')
      .select('contact_id, contacts(name, phone)')
      .eq('id', conversationId)
      .single();

    type ContactRow = { name: string | null; phone: string | null };
    const raw     = (conv as unknown as { contacts: ContactRow | ContactRow[] | null } | null)?.contacts;
    const contact = Array.isArray(raw) ? (raw[0] ?? null) : raw;
    const contactLine = `${contact?.name ?? 'Unknown'} · ${contact?.phone ?? ''}`.trim();

    const entitiesText = Object.entries(aiVars).length
      ? Object.entries(aiVars).map(([k, v]) => `${k}: ${v}`).join('\n')
      : 'No details captured yet';

    const prompt = `Summarize this sales lead for a human agent who will follow up.
Contact: ${contactLine}
Stage: ${stage}
Captured details:
${entitiesText}

Write EXACTLY 5 lines in this format (no extra lines, no preamble):
👤 Contact: [name and phone]
🛒 Interest: [what they want — product and quantity]
💰 Budget: [budget if known, else "Not specified"]
⏱ Timeline: [urgency or timeline if known, else "Not specified"]
📌 Next step: [one specific action for the agent to take now]`;

    const result = await routedChatCompletion({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 250,
    });

    await db.from('escalations').update({ ai_summary: result.content.trim() }).eq('id', escalationId);
    log.info({ escalationId }, '[LeadScore] Handoff summary stored');
  } catch (err) {
    log.error({ err, escalationId }, '[LeadScore] Failed to generate handoff summary');
  }
}
