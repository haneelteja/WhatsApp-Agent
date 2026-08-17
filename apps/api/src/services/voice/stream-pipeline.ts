// Streaming voice pipeline: Twilio Media Streams → Smallest.ai Pulse STT → Claude → Smallest.ai Lightning TTS
//
// Architecture:
//   Twilio streams raw mulaw 8kHz audio → our WebSocket server → Smallest.ai Pulse (realtime STT)
//   On final transcript → Claude Haiku → Smallest.ai Lightning (TTS) → audio back to Twilio
//
// Latency improvement vs batch Record/Respond:
//   Old: record (1-3s) + download + STT (1-2s) + Claude (1-2s) + TTS (1s) = 4-8s
//   New: endpointing (~0ms wait) + STT (0.5s) + Claude (1-2s) + TTS (0.5s) = 2-3s

import WebSocket from 'ws';
import { getServerClient } from '@alphabot/database';
import { getAIResponse } from '../ai/claude.js';
import { lookupKB } from '../kb/lookup.js';
import {
  loadVoiceBotContextCached,
  loadPreviousContextCached,
  buildVoiceSystemPrompt,
  appendTranscript,
} from './pipeline.js';
import type { Message, ProductSlug } from '@alphabot/shared';
import type { FastifyBaseLogger } from 'fastify';

const STT_WS_URL = 'wss://api.smallest.ai/waves/v1/stt/live';
const TTS_REST_URL = 'https://api.smallest.ai/waves/v1/tts';
const END_CALL_MARKER = '[END_CALL]';
const MAX_TURNS = 20;

// Default voice: meher = Indian English + Hindi, Pro model, supports word timestamps
const DEFAULT_VOICE_ID = 'meher';
const DEFAULT_TTS_MODEL = 'lightning_v3.1_pro';

function getApiKey(): string {
  return process.env['SMALLEST_AI_API_KEY'] ?? '';
}

// ─── TTS: synthesise text → raw ulaw buffer ───────────────────────────────────

async function synthesiseSpeech(
  text:     string,
  language: string,
  voiceId:  string | null | undefined,
): Promise<Buffer> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('SMALLEST_AI_API_KEY env var not set');

  // Map BCP-47 to Smallest.ai language code
  const langCode = language.startsWith('hi') ? 'hi' : 'en';

  const res = await fetch(TTS_REST_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'Accept':        'audio/wav',
    },
    body: JSON.stringify({
      text,
      voice_id:      voiceId ?? DEFAULT_VOICE_ID,
      model:         DEFAULT_TTS_MODEL,
      language:      langCode,
      output_format: 'ulaw',
      sample_rate:   8000,
      speed:         1.1,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Smallest.ai TTS ${res.status}: ${body.slice(0, 300)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// ─── Send audio to Twilio over Media Streams ──────────────────────────────────

function sendAudio(twilioWs: WebSocket, streamSid: string, audio: Buffer): void {
  if (twilioWs.readyState !== WebSocket.OPEN) return;

  // Send in 200ms chunks (1600 bytes of mulaw at 8kHz) for smooth playback
  const CHUNK = 1600;
  for (let i = 0; i < audio.length; i += CHUNK) {
    twilioWs.send(JSON.stringify({
      event:     'media',
      streamSid,
      media:     { payload: audio.subarray(i, i + CHUNK).toString('base64') },
    }));
  }

  // Mark signals when Twilio finishes playing this audio
  twilioWs.send(JSON.stringify({
    event:     'mark',
    streamSid,
    mark:      { name: 'response_end' },
  }));
}

function clearTwilioAudio(twilioWs: WebSocket, streamSid: string): void {
  if (twilioWs.readyState !== WebSocket.OPEN) return;
  twilioWs.send(JSON.stringify({ event: 'clear', streamSid }));
}

// ─── Build Message array for Claude from history + current turn ───────────────

function buildMessages(voiceCallId: string, history: string, customerText: string): Message[] {
  const makeMsg = (role: 'user' | 'assistant', content: string): Message => ({
    id: '', conversation_id: voiceCallId, role, content,
    media_url: null, media_type: null, whatsapp_msg_id: null,
    confidence_score: null, delivery_status: null,
    timestamp: new Date().toISOString(),
  });

  const past = history
    .split('\n')
    .filter(Boolean)
    .map(line =>
      makeMsg(
        line.startsWith('CALLER:') ? 'user' : 'assistant',
        line.replace(/^(CALLER:|BOT:)\s*/, ''),
      ),
    );

  return [...past, makeMsg('user', customerText)];
}

// ─── Start Twilio call recording via REST API ─────────────────────────────────

async function startTwilioRecording(
  db:          ReturnType<typeof getServerClient>,
  callSid:     string,
  accountSid:  string,
  log:         FastifyBaseLogger,
  voiceCallId: string,
): Promise<void> {
  try {
    const { data } = await db
      .from('voice_provider_configs')
      .select('credentials_json')
      .eq('provider_name', 'twilio')
      .eq('component', 'telephony')
      .limit(1)
      .maybeSingle();

    const creds     = data?.credentials_json as Record<string, string> | null;
    const authToken = creds?.['auth_token'];
    if (!authToken) {
      log.warn({ voiceCallId }, '[Stream] No Twilio auth_token — skipping recording');
      return;
    }

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const res  = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}/Recordings.json`,
      {
        method:  'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    'RecordingChannels=mono',
        signal:  AbortSignal.timeout(5_000),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      log.warn({ voiceCallId, status: res.status, body: body.slice(0, 200) }, '[Stream] Twilio recording start failed');
    } else {
      log.info({ voiceCallId, callSid }, '[Stream] Twilio recording started');
    }
  } catch (err) {
    log.error({ err, voiceCallId }, '[Stream] Failed to start Twilio recording');
  }
}

// ─── Main stream session handler ──────────────────────────────────────────────

export async function handleStreamSession(
  twilioWs:   WebSocket,
  voiceCallId: string,
  log:         FastifyBaseLogger,
): Promise<void> {
  const db = getServerClient();

  const { data: callRow } = await db
    .from('voice_calls')
    .select('tenant_id, product_slug')
    .eq('id', voiceCallId)
    .single();

  if (!callRow) {
    log.warn({ voiceCallId }, '[Stream] Call not found');
    twilioWs.close();
    return;
  }

  const call        = callRow as { tenant_id: string; product_slug: string };
  const tenantId    = call.tenant_id;
  const productSlug = call.product_slug as ProductSlug;

  // Load context once for the whole call
  const [vbCtx, previousContext] = await Promise.all([
    loadVoiceBotContextCached(db, tenantId, productSlug),
    loadPreviousContextCached(db, voiceCallId, tenantId),
  ]);

  const voiceCfg = vbCtx.voiceCfg;
  const language  = voiceCfg.language ?? 'en-IN';
  const voiceId   = voiceCfg.tts_voice ?? DEFAULT_VOICE_ID;

  const DEFAULT_SYSTEM_PROMPTS: Record<string, string> = {
    support_bot:   'You are a helpful customer support assistant. Answer questions accurately using the knowledge base.',
    sales_bot:     'You are a sales assistant. Understand customer needs and recommend the right product.',
    lifecycle_bot: 'You are an account management assistant. Help customers with orders, invoices, and payments.',
  };

  const basePrompt =
    vbCtx.baseSystemPrompt ??
    DEFAULT_SYSTEM_PROMPTS[productSlug] ??
    DEFAULT_SYSTEM_PROMPTS['support_bot']!;

  const systemPrompt = buildVoiceSystemPrompt(
    basePrompt,
    voiceCfg,
    vbCtx.platform_guardrails,
    vbCtx.bot_type_guardrails,
    vbCtx.tenant_guardrails,
    vbCtx.guardrails_json as { blocked_topics?: string[]; tone?: string; kb_only_mode?: boolean } | null,
    language,
    previousContext,
  );

  // ─── Per-call mutable state ─────────────────────────────────────────────
  let streamSid:           string | null = null;
  let sttWs:               WebSocket | null = null;
  let conversationHistory  = '';
  let turnCount            = 0;
  let isBotSpeaking        = false;
  let processingTurn       = false;

  // ─── Process one customer utterance ────────────────────────────────────
  async function processTurn(customerText: string): Promise<void> {
    if (processingTurn || !streamSid) return;
    processingTurn = true;
    isBotSpeaking  = true;

    log.info({ voiceCallId, customerText }, '[Stream] Processing turn');

    try {
      const [kbResults] = await Promise.all([
        lookupKB(tenantId, productSlug, customerText),
      ]);

      const messages = buildMessages(voiceCallId, conversationHistory, customerText);
      const aiResult = await getAIResponse(systemPrompt, messages, kbResults);

      const shouldEnd  = aiResult.content.includes(END_CALL_MARKER) || turnCount >= MAX_TURNS;
      const cleanReply = aiResult.content
        .replace(END_CALL_MARKER, '')
        .replace(/\[SALES_LEAD\]/g, '')
        .replace(/\[STAGE:\w+\]/g, '')
        .replace(/\[ENTITY:[^\]]+\]/g, '')
        .trimEnd();

      log.info({ voiceCallId, reply: cleanReply.slice(0, 100) }, '[Stream] Claude reply');

      const audio = await synthesiseSpeech(cleanReply, language, voiceId);

      if (twilioWs.readyState === WebSocket.OPEN && streamSid) {
        sendAudio(twilioWs, streamSid, audio);
      }

      // Persist transcript (non-blocking)
      const transcriptLine = `CALLER: ${customerText}\nBOT: ${cleanReply}`;
      conversationHistory  = conversationHistory
        ? `${conversationHistory}\n${transcriptLine}`
        : transcriptLine;
      turnCount++;
      void appendTranscript(voiceCallId, transcriptLine);

      if (shouldEnd) {
        setTimeout(() => {
          if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
        }, 6000);
      }
    } catch (err) {
      log.error({ err, voiceCallId }, '[Stream] Turn failed');
      try {
        const fallbackAudio = await synthesiseSpeech(
          'I am having trouble with that. Could you repeat?',
          language, voiceId,
        );
        if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
          sendAudio(twilioWs, streamSid, fallbackAudio);
        }
      } catch { /* ignore */ }
    } finally {
      processingTurn = false;
      // isBotSpeaking stays true until the 'mark' event from Twilio
    }
  }

  // ─── Open Smallest.ai STT WebSocket ────────────────────────────────────
  function openSttWs(): void {
    const langCode = language.startsWith('hi') ? 'hi' : 'en';
    const url      = `${STT_WS_URL}?model=pulse&language=${langCode}&encoding=mulaw&sample_rate=8000&endpointing=true&punctuate=true&vad_events=true`;

    sttWs = new WebSocket(url, {
      headers: { Authorization: `Bearer ${getApiKey()}` },
    });

    sttWs.on('open', () => {
      log.info({ voiceCallId }, '[Stream] STT WebSocket open');
    });

    sttWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type:        string;
          transcript?: string;
          is_final?:   boolean;
          status?:     string;
        };

        if (msg.type === 'transcription' && msg.is_final && msg.transcript?.trim()) {
          const text = msg.transcript.trim();
          log.info({ voiceCallId, text }, '[Stream] STT final');

          // Barge-in: user spoke while bot was playing audio
          if (isBotSpeaking && streamSid) {
            clearTwilioAudio(twilioWs, streamSid);
            isBotSpeaking = false;
          }

          void processTurn(text);

        } else if (msg.type === 'speech_started' && isBotSpeaking && streamSid) {
          // VAD detected speech — clear bot audio immediately
          clearTwilioAudio(twilioWs, streamSid);
          isBotSpeaking = false;

        } else if (msg.type === 'error') {
          log.error({ voiceCallId, msg }, '[Stream] STT error event');
        }
      } catch { /* ignore parse errors */ }
    });

    sttWs.on('error', (err) => log.error({ err, voiceCallId }, '[Stream] STT WS error'));
    sttWs.on('close', () => log.info({ voiceCallId }, '[Stream] STT WS closed'));
  }

  // ─── Twilio Media Streams events ────────────────────────────────────────
  twilioWs.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as {
        event:      string;
        streamSid?: string;
        start?:     { streamSid: string; callSid?: string; accountSid?: string };
        media?:     { payload: string };
        mark?:      { name: string };
      };

      switch (msg.event) {
        case 'start': {
          streamSid = msg.start?.streamSid ?? msg.streamSid ?? null;
          const callSid    = msg.start?.callSid    ?? null;
          const accountSid = msg.start?.accountSid ?? null;

          log.info({ voiceCallId, streamSid, callSid }, '[Stream] Twilio stream started');

          void db.from('voice_calls').update({
            status: 'in_progress',
            ...(callSid ? { telephony_call_sid: callSid } : {}),
          }).eq('id', voiceCallId);

          // Start recording so the client portal can play it back later
          if (callSid && accountSid) {
            void startTwilioRecording(db, callSid, accountSid, log, voiceCallId);
          }

          // Open STT first, then synthesise + play greeting
          openSttWs();

          const greeting =
            voiceCfg.greeting_message ??
            'Hello! I am your support assistant. How can I help you today?';

          try {
            isBotSpeaking = true;
            const greetingAudio = await synthesiseSpeech(greeting, language, voiceId);
            if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
              sendAudio(twilioWs, streamSid, greetingAudio);
            }
          } catch (err) {
            log.error({ err, voiceCallId }, '[Stream] Greeting synthesis failed');
            isBotSpeaking = false;
          }
          break;
        }

        case 'media': {
          // Forward audio bytes to STT in real-time
          if (sttWs?.readyState === WebSocket.OPEN && msg.media?.payload) {
            const bytes = Buffer.from(msg.media.payload, 'base64');
            sttWs.send(bytes);
          }
          break;
        }

        case 'mark': {
          // Twilio finished playing our audio
          if (msg.mark?.name === 'response_end') {
            isBotSpeaking = false;
          }
          break;
        }

        case 'stop': {
          log.info({ voiceCallId }, '[Stream] Twilio stream stopped');
          if (sttWs?.readyState === WebSocket.OPEN) {
            sttWs.send(JSON.stringify({ type: 'close_stream' }));
          }
          break;
        }
      }
    } catch (err) {
      log.error({ err, voiceCallId }, '[Stream] Twilio message parse error');
    }
  });

  twilioWs.on('close', () => {
    log.info({ voiceCallId }, '[Stream] Twilio WS closed — cleaning up');
    if (sttWs && sttWs.readyState === WebSocket.OPEN) sttWs.close();
  });

  twilioWs.on('error', (err) => {
    log.error({ err, voiceCallId }, '[Stream] Twilio WS error');
  });
}
