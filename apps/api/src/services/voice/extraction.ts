// Post-call structured extraction.
// After a voice call ends, runs a single Claude Haiku call to extract structured
// outcome data from the transcript. Stored as voice_calls.outcome_json.
// Cost: ~0.5¢ per call (~₹0.04). Negligible.

import { chatCompletion, REPLY_MODEL } from '../../lib/anthropic.js';
import { getServerClient } from '@alphabot/database';
import type { VoiceCallOutcome } from '@alphabot/shared';

const EXTRACTION_PROMPT = `You are a call outcome analyst. Given a voice call transcript between a customer and a support/sales bot, extract the following information as a JSON object.

Return ONLY valid JSON, no explanation, no markdown code blocks.

Required fields:
{
  "intent": string,            // e.g. "product inquiry", "complaint", "order status", "pricing", "general support"
  "product_interest": string,  // specific product name or "none" if not mentioned
  "resolved": boolean,         // was the customer's issue/question fully resolved?
  "escalation_needed": boolean,// does this need a human follow-up?
  "sentiment": "positive" | "neutral" | "negative" | "frustrated",
  "follow_up_action": string,  // e.g. "send product catalog", "human call back", "send quote", "none"
  "summary": string            // 1-2 sentence summary of the call
}`;

export async function extractCallOutcome(
  voiceCallId: string,
  transcript:  string,
): Promise<VoiceCallOutcome | null> {
  if (!transcript || transcript.trim().length < 20) return null;

  try {
    const { content } = await chatCompletion({
      model:      REPLY_MODEL,
      max_tokens: 300,
      system:     EXTRACTION_PROMPT,
      messages:   [{ role: 'user', content: `TRANSCRIPT:\n${transcript.slice(0, 4000)}` }],
    });

    const json = JSON.parse(content.trim()) as VoiceCallOutcome;

    // Persist to DB
    const db = getServerClient();
    await db
      .from('voice_calls')
      .update({ outcome_json: json })
      .eq('id', voiceCallId);

    return json;
  } catch (err) {
    console.error('[VoiceExtraction] Failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * After a call completes, calculate and log the estimated cost in rupees.
 * Uses provider rate data from the DB.
 */
export async function logCallCost(
  voiceCallId:       string,
  durationSeconds:   number,
  telephonyProvider: string,
  sttProvider:       string,
): Promise<void> {
  const db = getServerClient();

  // Fetch rates for the providers used
  const { data: rows } = await db
    .from('voice_provider_configs')
    .select('component, provider_name, estimated_cost_per_min_inr')
    .in('provider_name', [telephonyProvider, sttProvider, 'twilio_say']);

  const getRate = (name: string) =>
    (rows as Array<{ provider_name: string; estimated_cost_per_min_inr: number | null }> | null)
      ?.find(r => r.provider_name === name)?.estimated_cost_per_min_inr ?? 0;

  const minutes     = durationSeconds / 60;
  const llmCostInr  = 0.42;  // Claude Haiku ~5 turns/min average
  const totalInr    = (getRate(telephonyProvider) + getRate(sttProvider) + llmCostInr) * minutes;

  await db
    .from('voice_calls')
    .update({ cost_rupees: Math.round(totalInr * 10000) / 10000 })
    .eq('id', voiceCallId);
}
