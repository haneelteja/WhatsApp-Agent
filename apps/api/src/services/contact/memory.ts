/**
 * Cross-session contact memory.
 *
 * When a conversation is resolved, summarise it with Claude and append a
 * compact entry to contact.memory_json.past_conversations[].
 * The bot reads this on the next conversation so returning customers feel known.
 */

import { getServerClient } from '@alphabot/database';
import { chatCompletion, REPLY_MODEL } from '../../lib/anthropic.js';

const MAX_PAST_CONVERSATIONS = 5; // keep only the last N summaries per contact

interface PastConversation {
  date:    string; // ISO date YYYY-MM-DD
  topic:   string; // one-line topic
  summary: string; // 3-5 bullet points
}

interface ContactMemoryJson {
  past_conversations?: PastConversation[];
  awaiting_csat?:      boolean;
  csat_score?:         number;
  sentiment?:          string;
  [key: string]:       unknown;
}

/**
 * Summarise a resolved conversation and persist the summary to the contact's
 * memory_json so the bot can reference it in future conversations.
 * Call this non-blocking (fire-and-forget) after marking a conversation resolved.
 */
export async function summariseAndStoreConversation(conversationId: string): Promise<void> {
  const db = getServerClient();

  // Load conversation + contact
  const { data: conv } = await db
    .from('conversations')
    .select('contact_id, product_type, tenant_id')
    .eq('id', conversationId)
    .single();

  if (!conv) return;

  // Load up to 60 messages for summarisation
  const { data: msgs } = await db
    .from('messages')
    .select('role, content, timestamp')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: true })
    .limit(60);

  if (!msgs || msgs.length < 2) return; // nothing worth summarising

  // Build transcript for Claude
  const transcript = (msgs as { role: string; content: string }[])
    .map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.content.slice(0, 300)}`)
    .join('\n');

  const systemPrompt = `You are a CRM assistant. Summarise the following customer conversation in this exact format:
TOPIC: <one-line description of what the customer needed>
SUMMARY:
• <bullet 1 — what they asked about>
• <bullet 2 — key details discussed (fees, dates, products, etc.)>
• <bullet 3 — outcome or next steps>
(3–5 bullets max. Be specific — include names, amounts, products mentioned. Be concise.)`;

  let summaryText: string;
  try {
    const { content } = await chatCompletion({
      model:      REPLY_MODEL,
      max_tokens: 250,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: `Conversation transcript:\n\n${transcript}` }],
    });
    summaryText = content.trim();
  } catch {
    return; // summarisation failed — don't block resolution
  }

  // Parse TOPIC and SUMMARY from response
  const topicMatch   = summaryText.match(/TOPIC:\s*(.+)/);
  const summaryMatch = summaryText.match(/SUMMARY:\s*([\s\S]+)/);

  const topic   = topicMatch?.[1]?.trim()   ?? 'General enquiry';
  const summary = summaryMatch?.[1]?.trim() ?? summaryText;

  const newEntry: PastConversation = {
    date:    new Date().toISOString().slice(0, 10),
    topic,
    summary,
  };

  // Load and update contact memory
  const { data: contact } = await db
    .from('contacts')
    .select('id, memory_json')
    .eq('id', conv.contact_id)
    .single();

  if (!contact) return;

  const existing = (contact.memory_json ?? {}) as ContactMemoryJson;
  const history  = existing.past_conversations ?? [];
  history.push(newEntry);

  // Keep only the most recent N summaries
  const trimmed = history.slice(-MAX_PAST_CONVERSATIONS);

  await db.from('contacts').update({
    memory_json: { ...existing, past_conversations: trimmed },
  }).eq('id', contact.id);
}

/**
 * Format contact memory_json into a readable string for the AI system prompt.
 * Returns empty string if there is nothing meaningful to surface.
 */
export function formatContactMemory(memJson: Record<string, unknown> | null): string {
  if (!memJson) return '';

  const lines: string[] = [];

  const sentiment = memJson['sentiment'] as string | undefined;
  const csat      = memJson['csat_score'] as number | undefined;

  if (sentiment)           lines.push(`Customer sentiment: ${sentiment}`);
  if (csat !== undefined)  lines.push(`Last satisfaction score: ${csat}/5`);

  const past = memJson['past_conversations'] as PastConversation[] | undefined;
  if (past?.length) {
    lines.push('');
    lines.push('Previous conversations with this customer:');
    for (const conv of past.slice(-3)) {
      lines.push(`[${conv.date}] ${conv.topic}`);
      lines.push(conv.summary);
    }
  }

  return lines.join('\n').trim();
}
