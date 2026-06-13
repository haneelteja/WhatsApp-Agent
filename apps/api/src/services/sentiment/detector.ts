import { chatCompletion } from '../../lib/openrouter.js';
import { getServerClient } from '@alphabot/database';
import type { ContactMemory, ContactSentiment } from '@alphabot/shared';

const VALID_SENTIMENTS: ContactSentiment[] = ['positive', 'neutral', 'negative', 'frustrated'];

export async function detectAndStoreSentiment(
  contactId: string,
  messageText: string,
): Promise<void> {
  if (!messageText?.trim() || messageText.length < 3) return;

  try {
    const { content } = await chatCompletion({
      model: process.env['OPENROUTER_REPLY_MODEL'] ?? 'meta-llama/llama-3.1-8b-instruct:free',
      system: 'Classify the customer message sentiment. Reply with ONLY one word: positive, neutral, negative, or frustrated.',
      messages: [{ role: 'user', content: messageText.slice(0, 400) }],
      max_tokens: 5,
    });

    const raw = content.trim().toLowerCase().replace(/[^a-z]/g, '') as ContactSentiment;
    const sentiment: ContactSentiment = VALID_SENTIMENTS.includes(raw) ? raw : 'neutral';

    const db = getServerClient();
    const { data: contact } = await db
      .from('contacts')
      .select('memory_json')
      .eq('id', contactId)
      .single();

    if (!contact) return;

    const memory = (contact.memory_json as ContactMemory) ?? {};
    await db.from('contacts').update({
      memory_json: {
        ...memory,
        sentiment,
        sentiment_updated_at: new Date().toISOString(),
      },
    }).eq('id', contactId);

  } catch (err) {
    console.warn('[Sentiment] detection failed:', err instanceof Error ? err.message : String(err));
  }
}
