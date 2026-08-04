// Voice call manager — dispatch outbound calls and track their lifecycle.

import { getServerClient } from '@alphabot/database';
import { resolveVoiceProviders, type TenantExotelCreds } from './registry.js';
import type { BotVoiceConfig, DispatchCallRequest, DispatchCallResponse } from '@alphabot/shared';

const API_BASE = process.env['API_BASE_URL'] ?? 'https://whatsapp-agent-fmtg.onrender.com';

// ─── Tenant voice config types ────────────────────────────────────────────────

interface TenantVoiceConfig {
  tenant_id:              string;
  from_number:            string;
  exotel_api_key:         string | null;
  exotel_api_token:       string | null;
  exotel_account_sid:     string | null;
  max_calls_per_month:    number | null;
  max_minutes_per_month:  number | null;
  max_calls_per_day:      number | null;
  max_cost_inr_per_month: number | null;
  calls_this_month:       number;
  minutes_this_month:     number;
  cost_inr_this_month:    number;
  calls_today:            number;
  monthly_reset_at:       string;  // YYYY-MM-DD
  daily_reset_at:         string;  // YYYY-MM-DD
}

// ─── Limit enforcement ────────────────────────────────────────────────────────

/**
 * Load the tenant's voice config row, auto-create it if absent, and reset
 * rolling counters when calendar month / day has turned over.
 */
async function loadTenantVoiceConfig(tenantId: string): Promise<TenantVoiceConfig> {
  const db = getServerClient();

  let { data } = await db
    .from('tenant_voice_configs')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();

  if (!data) {
    // First voice call for this tenant — create the row with unlimited defaults
    const { data: created } = await db
      .from('tenant_voice_configs')
      .insert({ tenant_id: tenantId })
      .select('*')
      .single();
    data = created;
  }

  if (!data) throw new Error('Failed to load tenant voice config');

  const cfg = data as TenantVoiceConfig;
  const today      = new Date().toISOString().slice(0, 10);          // YYYY-MM-DD
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartStr = monthStart.toISOString().slice(0, 10);

  const updates: Record<string, unknown> = {};

  if (cfg.monthly_reset_at < monthStartStr) {
    updates.calls_this_month    = 0;
    updates.minutes_this_month  = 0;
    updates.cost_inr_this_month = 0;
    updates.monthly_reset_at    = monthStartStr;
  }

  if (cfg.daily_reset_at < today) {
    updates.calls_today    = 0;
    updates.daily_reset_at = today;
  }

  if (Object.keys(updates).length > 0) {
    await db.from('tenant_voice_configs').update(updates).eq('tenant_id', tenantId);
    Object.assign(cfg, updates);
  }

  return cfg;
}

function enforceLimits(cfg: TenantVoiceConfig): void {
  if (cfg.max_calls_per_month !== null && cfg.calls_this_month >= cfg.max_calls_per_month) {
    throw new Error(
      `Monthly call limit reached (${cfg.max_calls_per_month} calls). Contact your platform administrator to increase the limit.`,
    );
  }
  if (cfg.max_calls_per_day !== null && cfg.calls_today >= cfg.max_calls_per_day) {
    throw new Error(
      `Daily call limit reached (${cfg.max_calls_per_day} calls). The limit resets at midnight.`,
    );
  }
  if (cfg.max_minutes_per_month !== null && cfg.minutes_this_month >= cfg.max_minutes_per_month) {
    throw new Error(
      `Monthly minute limit reached (${cfg.max_minutes_per_month} mins). Contact your platform administrator to increase the limit.`,
    );
  }
  if (cfg.max_cost_inr_per_month !== null && cfg.cost_inr_this_month >= cfg.max_cost_inr_per_month) {
    throw new Error(
      `Monthly cost budget reached (₹${cfg.max_cost_inr_per_month}). Contact your platform administrator to increase the limit.`,
    );
  }
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Dispatch an outbound voice call.
 * 1. Loads tenant voice config — enforces monthly/daily limits.
 * 2. Creates a voice_calls record (status=initiated).
 * 3. Calls the telephony provider using the tenant's from_number.
 * 4. Increments the tenant's usage counters.
 */
export async function dispatchCall(req: DispatchCallRequest): Promise<DispatchCallResponse> {
  const db = getServerClient();

  // Load bot voice_config
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

  // Load tenant voice config and enforce limits before creating any DB records
  const tenantVoiceCfg = await loadTenantVoiceConfig(req.tenant_id);
  enforceLimits(tenantVoiceCfg);

  const telephonyProvider = voiceCfg.telephony_provider ?? 'twilio';

  // For Exotel: tenant must have their own credentials — complete client isolation, no platform fallback.
  // For Twilio: platform credentials are used (tenantExotelCreds stays undefined).
  let tenantExotelCreds: TenantExotelCreds | undefined;
  let tenantFromNumber: string | undefined;

  if (telephonyProvider === 'exotel') {
    if (!tenantVoiceCfg.exotel_api_key || !tenantVoiceCfg.exotel_api_token || !tenantVoiceCfg.exotel_account_sid) {
      throw new Error(
        'No Exotel account configured for this client. ' +
        'Go to Settings → Voice to connect your Exotel account before launching voice calls.',
      );
    }
    if (!tenantVoiceCfg.from_number) {
      throw new Error(
        'No outbound caller ID configured for this client. ' +
        'Go to Settings → Voice to select your Exotel virtual number.',
      );
    }
    tenantExotelCreds = {
      api_key:     tenantVoiceCfg.exotel_api_key,
      api_token:   tenantVoiceCfg.exotel_api_token,
      account_sid: tenantVoiceCfg.exotel_account_sid,
    };
    tenantFromNumber = tenantVoiceCfg.from_number;
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
      from_number:        tenantVoiceCfg.from_number || '',
      to_number:          req.to_number,
      product_slug:       req.product_slug,
      telephony_provider: telephonyProvider,
      stt_provider:       voiceCfg.stt_provider  ?? 'deepgram',
      tts_provider:       voiceCfg.tts_provider  ?? 'twilio_say',
      status:             'initiated',
      triggered_by:       req.triggered_by ?? 'manual',
    })
    .select('id')
    .single();

  if (insertErr || !callRow) {
    throw new Error(`Failed to create voice_calls record: ${insertErr?.message}`);
  }

  const voiceCallId = (callRow as { id: string }).id;

  // Build callback URLs
  const twimlUrl       = `${API_BASE}/api/voice/twiml/${voiceCallId}`;
  const respondUrl     = `${API_BASE}/api/voice/respond/${voiceCallId}`;
  const statusCallback = `${API_BASE}/api/voice/status/${voiceCallId}`;

  await db.from('voice_calls').update({ recording_url: respondUrl }).eq('id', voiceCallId);

  try {
    // Resolve providers — Exotel uses tenant creds; Twilio uses platform creds
    const providers = await resolveVoiceProviders(voiceCfg, tenantFromNumber, tenantExotelCreds);

    await db.from('voice_calls')
      .update({ from_number: providers.fromNumber })
      .eq('id', voiceCallId);

    const twimlWithContext = req.call_context
      ? `${twimlUrl}?${new URLSearchParams(req.call_context).toString()}`
      : twimlUrl;

    const result = await providers.telephony.dispatch({
      to:             req.to_number,
      from:           providers.fromNumber,
      twimlUrl:       twimlWithContext,
      statusCallback,
    });

    await db.from('voice_calls')
      .update({ telephony_call_sid: result.callSid, status: result.status })
      .eq('id', voiceCallId);

    // Increment call counters (fire-and-forget — don't block the response)
    void db.from('tenant_voice_configs')
      .update({
        calls_this_month: tenantVoiceCfg.calls_this_month + 1,
        calls_today:      tenantVoiceCfg.calls_today + 1,
      })
      .eq('tenant_id', req.tenant_id);

    return { voice_call_id: voiceCallId, telephony_call_sid: result.callSid, status: result.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.from('voice_calls')
      .update({ status: 'failed', error_message: msg })
      .eq('id', voiceCallId);
    throw err;
  }
}

// ─── Post-call lifecycle ──────────────────────────────────────────────────────

/**
 * Mark a voice call as completed and run post-call processing.
 * Called from the telephony status callback webhook.
 */
export async function finaliseCall(
  voiceCallId:     string,
  callSid:         string,
  finalStatus:     string,
  durationSeconds: number | null,
  recordingUrl?:   string,
): Promise<void> {
  const db = getServerClient();

  const statusMap: Record<string, string> = {
    'completed': 'completed',
    'failed':    'failed',
    'busy':      'busy',
    'no-answer': 'no_answer',
    'canceled':  'failed',
  };

  const status = statusMap[finalStatus] ?? 'completed';

  const updatePayload: Record<string, unknown> = {
    status,
    duration_seconds:   durationSeconds,
    telephony_call_sid: callSid,
  };
  // Only overwrite recording_url if Exotel/Twilio actually sent one
  if (recordingUrl) updatePayload.recording_url = recordingUrl;

  await db.from('voice_calls').update(updatePayload).eq('id', voiceCallId);

  if (status === 'completed' && durationSeconds) {
    void runPostCallProcessing(voiceCallId, durationSeconds);
  }
}

async function runPostCallProcessing(voiceCallId: string, durationSeconds: number): Promise<void> {
  const db = getServerClient();

  const { data } = await db
    .from('voice_calls')
    .select('transcript, telephony_provider, stt_provider, duration_seconds, conversation_id, tenant_id')
    .eq('id', voiceCallId)
    .single();

  if (!data) return;

  const call = data as {
    transcript:         string | null;
    telephony_provider: string;
    stt_provider:       string;
    duration_seconds:   number | null;
    conversation_id:    string | null;
    tenant_id:          string;
  };

  // 1. Extract structured outcome from transcript
  if (call.transcript) {
    const { extractCallOutcome } = await import('./extraction.js');
    const outcome = await extractCallOutcome(voiceCallId, call.transcript);

    if (outcome?.escalation_needed && call.conversation_id) {
      await db.from('conversations').update({
        ai_vars: { voice_outcome: outcome.summary, voice_follow_up: outcome.follow_up_action },
      }).eq('id', call.conversation_id);
    }
  }

  // 2. Log cost to voice_calls
  const { logCallCost } = await import('./extraction.js');
  await logCallCost(voiceCallId, durationSeconds, call.telephony_provider, call.stt_provider);

  // 3. Update tenant's rolling usage (minutes + cost)
  const { data: updatedCall } = await db
    .from('voice_calls')
    .select('cost_rupees')
    .eq('id', voiceCallId)
    .single();

  const costRupees = (updatedCall as { cost_rupees: number | null } | null)?.cost_rupees ?? 0;
  const minutesBilled = durationSeconds / 60;

  const { data: tvc } = await db
    .from('tenant_voice_configs')
    .select('minutes_this_month, cost_inr_this_month')
    .eq('tenant_id', call.tenant_id)
    .single();

  if (tvc) {
    const prev = tvc as { minutes_this_month: number; cost_inr_this_month: number };
    await db.from('tenant_voice_configs')
      .update({
        minutes_this_month:  prev.minutes_this_month  + minutesBilled,
        cost_inr_this_month: prev.cost_inr_this_month + costRupees,
      })
      .eq('tenant_id', call.tenant_id);
  }
}
