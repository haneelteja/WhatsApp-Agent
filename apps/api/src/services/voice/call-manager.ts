// Voice call manager — dispatch outbound calls and track their lifecycle.

import { getServerClient } from '@alphabot/database';
import { resolveVoiceProviders } from './registry.js';
import type { BotVoiceConfig, DispatchCallRequest, DispatchCallResponse } from '@alphabot/shared';

const API_BASE = process.env['API_BASE_URL'] ?? 'https://whatsapp-agent-fmtg.onrender.com';

/**
 * Dispatch an outbound voice call.
 * 1. Creates a voice_calls record (status=initiated)
 * 2. Calls the telephony provider
 * 3. Updates the record with the telephony call SID
 */
export async function dispatchCall(req: DispatchCallRequest): Promise<DispatchCallResponse> {
  const db = getServerClient();

  // Query voice_config directly — getBotContext requires a WhatsApp number which
  // voice-only campaigns don't have, so we go straight to bot_configs.
  const { data: botCfgRow } = await db
    .from('bot_configs')
    .select('voice_config')
    .eq('tenant_id', req.tenant_id)
    .eq('product_slug', req.product_slug)
    .single();

  const voiceCfg = (botCfgRow?.voice_config ?? {}) as BotVoiceConfig;

  if (!voiceCfg.enabled) {
    throw new Error(`Voice is not enabled for ${req.product_slug}. Enable it in Guardrails → Per-Bot Config → Voice.`);
  }

  // Create voice_calls record first to get an ID
  const { data: callRow, error: insertErr } = await db
    .from('voice_calls')
    .insert({
      tenant_id:          req.tenant_id,
      conversation_id:    req.conversation_id   ?? null,
      contact_id:         req.contact_id        ?? null,
      campaign_id:        req.campaign_id       ?? null,
      direction:          'outbound',
      from_number:        '',   // filled after provider resolution
      to_number:          req.to_number,
      product_slug:       req.product_slug,
      telephony_provider: voiceCfg.telephony_provider ?? 'twilio',
      stt_provider:       voiceCfg.stt_provider       ?? 'deepgram',
      tts_provider:       voiceCfg.tts_provider       ?? 'twilio_say',
      status:             'initiated',
      triggered_by:       req.triggered_by ?? 'manual',
    })
    .select('id')
    .single();

  if (insertErr || !callRow) {
    throw new Error(`Failed to create voice_calls record: ${insertErr?.message}`);
  }

  const voiceCallId = (callRow as { id: string }).id;

  // Build callback URLs (Twilio will POST to these)
  const twimlUrl       = `${API_BASE}/api/voice/twiml/${voiceCallId}`;
  const respondUrl     = `${API_BASE}/api/voice/respond/${voiceCallId}`;
  const statusCallback = `${API_BASE}/api/voice/status/${voiceCallId}`;

  // Store the respond URL in the call record so the pipeline can reference it
  await db.from('voice_calls').update({ recording_url: respondUrl }).eq('id', voiceCallId);

  try {
    // Resolve providers and dispatch
    const providers = await resolveVoiceProviders(voiceCfg);

    // Update from_number now that we have it
    await db.from('voice_calls')
      .update({ from_number: providers.fromNumber })
      .eq('id', voiceCallId);

    // Encode call_context in the TwiML URL as query params
    const twimlWithContext = req.call_context
      ? `${twimlUrl}?${new URLSearchParams(req.call_context).toString()}`
      : twimlUrl;

    const result = await providers.telephony.dispatch({
      to:             req.to_number,
      from:           providers.fromNumber,
      twimlUrl:       twimlWithContext,
      statusCallback,
    });

    // Update with telephony SID + ringing status
    await db.from('voice_calls')
      .update({ telephony_call_sid: result.callSid, status: result.status })
      .eq('id', voiceCallId);

    return { voice_call_id: voiceCallId, telephony_call_sid: result.callSid, status: result.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.from('voice_calls')
      .update({ status: 'failed', error_message: msg })
      .eq('id', voiceCallId);
    throw err;
  }
}

/**
 * Mark a voice call as completed and run post-call processing.
 * Called from the telephony status callback webhook.
 */
export async function finaliseCall(
  voiceCallId:     string,
  callSid:         string,
  finalStatus:     string,
  durationSeconds: number | null,
): Promise<void> {
  const db = getServerClient();

  const statusMap: Record<string, string> = {
    'completed':   'completed',
    'failed':      'failed',
    'busy':        'busy',
    'no-answer':   'no_answer',
    'canceled':    'failed',
  };

  const status = statusMap[finalStatus] ?? 'completed';

  await db.from('voice_calls')
    .update({
      status,
      duration_seconds:  durationSeconds,
      telephony_call_sid: callSid,
    })
    .eq('id', voiceCallId);

  if (status === 'completed' && durationSeconds) {
    // Run post-call extraction (non-blocking)
    void runPostCallProcessing(voiceCallId);
  }
}

async function runPostCallProcessing(voiceCallId: string): Promise<void> {
  const db = getServerClient();
  const { data } = await db
    .from('voice_calls')
    .select('transcript, telephony_provider, stt_provider, duration_seconds, conversation_id, tenant_id')
    .eq('id', voiceCallId)
    .single();

  if (!data) return;
  const call = data as {
    transcript: string | null;
    telephony_provider: string;
    stt_provider: string;
    duration_seconds: number | null;
    conversation_id: string | null;
    tenant_id: string;
  };

  // 1. Extract structured outcome
  if (call.transcript) {
    const { extractCallOutcome } = await import('./extraction.js');
    const outcome = await extractCallOutcome(voiceCallId, call.transcript);

    // 2. If escalation needed and linked to a WhatsApp conversation, update it
    if (outcome?.escalation_needed && call.conversation_id) {
      await db.from('conversations').update({
        ai_vars: { voice_outcome: outcome.summary, voice_follow_up: outcome.follow_up_action },
      }).eq('id', call.conversation_id);
    }
  }

  // 3. Log cost
  if (call.duration_seconds) {
    const { logCallCost } = await import('./extraction.js');
    await logCallCost(voiceCallId, call.duration_seconds, call.telephony_provider, call.stt_provider);
  }
}
