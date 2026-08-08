// Voice conversation pipeline.
//
// Architecture: Twilio Record/Respond (request-response, not streaming).
//
// Flow per turn:
//   Twilio → POST /api/voice/respond/:voiceCallId  (with RecordingUrl)
//   → fetchRecording → STT → Claude Haiku (same KB + guardrails) → TTS → TwiML response
//
// This avoids WebSocket complexity while keeping cost at ~₹1.86/min (Twilio+Deepgram)
// or ~₹1.07/min (Exotel+Sarvam). Upgrade to streaming WebSocket later as needed.
//
// The pipeline is purely functional — it takes inputs and returns a TwiML string.
// State (transcript, turn count) is persisted in voice_calls by the caller.

import { getServerClient } from '@alphabot/database';
import { getAIResponse } from '../ai/claude.js';
import { lookupKB } from '../kb/lookup.js';
import { getBotContext } from '../bot-context.js';
import type { SttProvider, TtsProvider } from './types.js';
import type {
  BotConfig, BotVoiceConfig, Message, PlatformGuardrails, LayeredGuardrailsConfig, Product,
  ProductSlug,
} from '@alphabot/shared';

const MAX_TURNS   = 20;
const RECORD_SEC  = 10;   // max silence detection window per turn

// ─── Previous context loader ──────────────────────────────────────────────────

/**
 * Fetch previous voice call summaries and linked WhatsApp messages for the
 * customer being called, so the bot doesn't ask repeat questions.
 */
async function loadPreviousContext(
  db:           ReturnType<typeof getServerClient>,
  voiceCallId:  string,
  tenantId:     string,
): Promise<string> {
  const { data: currentCall } = await db
    .from('voice_calls')
    .select('to_number, conversation_id')
    .eq('id', voiceCallId)
    .single();

  if (!currentCall) return '';
  const call = currentCall as { to_number: string; conversation_id: string | null };

  const parts: string[] = [];

  // Last 2 completed calls to this number
  const { data: prevCalls } = await db
    .from('voice_calls')
    .select('transcript, created_at, outcome_json')
    .eq('tenant_id', tenantId)
    .eq('to_number', call.to_number)
    .eq('status', 'completed')
    .neq('id', voiceCallId)
    .order('created_at', { ascending: false })
    .limit(2);

  for (const c of (prevCalls ?? []) as Array<{ transcript: string | null; created_at: string; outcome_json: { summary?: string } | null }>) {
    const date = new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    const summary = c.outcome_json?.summary ?? (c.transcript ? c.transcript.slice(0, 300) : null);
    if (summary) parts.push(`[Voice call on ${date}]: ${summary}`);
  }

  // Last 10 messages from the linked WhatsApp conversation
  if (call.conversation_id) {
    const { data: msgs } = await db
      .from('messages')
      .select('role, content, timestamp')
      .eq('conversation_id', call.conversation_id)
      .order('timestamp', { ascending: false })
      .limit(10);

    const msgArr = ((msgs ?? []) as Array<{ role: string; content: string }>).reverse();
    if (msgArr.length > 0) {
      const chatStr = msgArr
        .map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.content.slice(0, 200)}`)
        .join('\n');
      parts.push(`[Recent WhatsApp chat]:\n${chatStr}`);
    }
  }

  if (parts.length === 0) return '';
  return `\n\nPrevious interactions with this customer (do NOT repeat questions already answered):\n${parts.join('\n\n')}`;
}

// Markers the AI can emit to control call flow
const END_CALL_MARKER = '[END_CALL]';

// ─── TwiML builders ───────────────────────────────────────────────────────────

function xmlResponse(...children: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${children.join('')}</Response>`;
}

function sayTag(snippet: string): string {
  // snippet is already a <Say> element from TwilioSay provider
  return snippet;
}

function recordTag(actionUrl: string, timeout = 5): string {
  return `<Record action="${actionUrl}" maxLength="${RECORD_SEC}" timeout="${timeout}" playBeep="false" trim="trim-silence" transcribe="false"/>`;
}

function hangupTag(): string {
  return '<Hangup/>';
}

function pauseTag(sec = 1): string {
  return `<Pause length="${sec}"/>`;
}

// ─── System prompt assembly for voice ────────────────────────────────────────

function buildVoiceSystemPrompt(
  basePrompt:      string,
  voiceConfig:     BotVoiceConfig,
  globalG:         PlatformGuardrails | null,
  botTypeG:        LayeredGuardrailsConfig | null,
  tenantG:         LayeredGuardrailsConfig | null,
  clientBotG:      { blocked_topics?: string[]; tone?: string; kb_only_mode?: boolean } | null,
  language:        string,
  previousContext: string = '',
): string {
  let prompt = basePrompt + previousContext;

  // Voice-specific instructions
  prompt += `\n\nIMPORTANT — You are responding via VOICE CALL, not text:
- Keep each response to 2-3 SHORT sentences maximum. Spoken responses must be brief.
- Do NOT use bullet points, markdown, emojis, or special characters.
- Do NOT say things like "here is a list" or "please see below".
- Speak naturally and conversationally.
- At the end of your response, ask ONE simple follow-up question to keep the conversation going — unless the issue is fully resolved.
- When the conversation is fully complete (issue resolved, customer satisfied, or customer wants to end), add exactly: ${END_CALL_MARKER}
- Do NOT add ${END_CALL_MARKER} unless the conversation is genuinely complete.`;

  const allBlockedTopics = [
    ...(globalG?.global_blocked_topics ?? []),
    ...(botTypeG?.blocked_topics ?? []),
    ...(tenantG?.blocked_topics ?? []),
    ...(clientBotG?.blocked_topics ?? []),
  ];
  if (allBlockedTopics.length > 0) {
    prompt += `\n\nDo NOT discuss: ${allBlockedTopics.join(', ')}.`;
  }

  const kbOnly =
    !!clientBotG?.kb_only_mode ||
    !!tenantG?.kb_only_mode    ||
    !!botTypeG?.kb_only_mode   ||
    !!globalG?.enforce_kb_only_globally;

  if (kbOnly) {
    prompt += '\n\nOnly answer from the knowledge base. If the answer is not there, say you will connect the customer with a specialist.';
  }

  // Language directive
  if (language && language !== 'en-IN' && language !== 'en-US') {
    const langNames: Record<string, string> = {
      'hi-IN': 'Hindi', 'ta-IN': 'Tamil', 'te-IN': 'Telugu',
      'kn-IN': 'Kannada', 'mr-IN': 'Marathi', 'gu-IN': 'Gujarati',
    };
    const langName = langNames[language] ?? language;
    prompt += `\n\nRespond in ${langName} (language code: ${language}).`;
  }

  return prompt;
}

// ─── Main pipeline functions ──────────────────────────────────────────────────

export interface PipelineContext {
  voiceCallId:   string;
  tenantId:      string;
  productSlug:   ProductSlug;
  respondUrl:    string;  // URL Twilio hits after each recording
  stt:           SttProvider;
  tts:           TtsProvider;
}

/**
 * Generate the opening TwiML for when the customer picks up.
 * Plays greeting then starts the first recording.
 */
export async function buildGreetingTwiml(ctx: PipelineContext, callContext?: Record<string, string>): Promise<string> {
  const botCtx     = await getBotContext(ctx.tenantId, ctx.productSlug, 'meta_cloud');
  const botConfig  = botCtx.bot_config as BotConfig | null;
  const voiceCfg   = (botConfig?.voice_config ?? {}) as BotVoiceConfig;

  const greeting =
    callContext?.['greeting_override'] ??
    voiceCfg.greeting_message ??
    'Hello! I am your support assistant. How can I help you today?';

  const ttsResult = await ctx.tts.synthesise({
    text:     greeting,
    language: voiceCfg.language ?? 'en-IN',
    voice:    voiceCfg.tts_voice ?? undefined,
  });

  const sayPart = ttsResult.twimlSaySnippet
    ? sayTag(ttsResult.twimlSaySnippet)
    : `<Play>${buildBase64AudioUrl(ttsResult.audioBase64 ?? '', ttsResult.audioMimeType ?? 'audio/mpeg')}</Play>`;

  return xmlResponse(sayPart, pauseTag(1), recordTag(ctx.respondUrl));
}

/**
 * Process one conversation turn:
 *  - Download + transcribe the recording
 *  - Query KB
 *  - Call Claude Haiku
 *  - Return TwiML (continue or hang up)
 *
 * Returns { twiml, transcript_line, should_end }
 */
export async function processTurn(
  ctx:           PipelineContext,
  recordingUrl:  string,
  recordingAuth: string,
  turnNumber:    number,
  conversationHistory: string,  // accumulated transcript text for context
): Promise<{ twiml: string; transcriptLine: string; shouldEnd: boolean }> {
  const db = getServerClient();

  // 1. Load bot context + previous customer history in parallel
  const [botCtx, previousContext] = await Promise.all([
    getBotContext(ctx.tenantId, ctx.productSlug, 'meta_cloud'),
    loadPreviousContext(db, ctx.voiceCallId, ctx.tenantId),
  ]);
  const botConfig = botCtx.bot_config as (BotConfig & { product: Product | null }) | null;
  const voiceCfg  = (botConfig?.voice_config ?? {}) as BotVoiceConfig;
  const language  = voiceCfg.language ?? 'en-IN';

  // 2. Transcribe the recording using the correct language
  const sttResult = await ctx.stt.transcribe({
    recordingUrl,
    recordingAuth,
    language,
  });

  const customerText = sttResult.transcript.trim();

  // Empty / silence — prompt to speak again (in the bot's configured language)
  if (!customerText || customerText.length < 2) {
    const silenceResponse = 'I did not catch that. Could you please repeat?';
    const ttsResult = await ctx.tts.synthesise({ text: silenceResponse, language });
    const sayPart = ttsResult.twimlSaySnippet ??
      `<Play>${buildBase64AudioUrl(ttsResult.audioBase64 ?? '', ttsResult.audioMimeType ?? 'audio/mpeg')}</Play>`;
    return {
      twiml:         xmlResponse(sayPart, pauseTag(1), recordTag(ctx.respondUrl)),
      transcriptLine: '',
      shouldEnd:     false,
    };
  }

  const DEFAULT_SYSTEM_PROMPTS: Record<string, string> = {
    support_bot:   'You are a helpful customer support assistant. Answer questions accurately using the knowledge base.',
    sales_bot:     'You are a sales assistant. Understand customer needs and recommend the right product.',
    lifecycle_bot: 'You are an account management assistant. Help customers with orders, invoices, and payments.',
  };

  const baseSystemPrompt =
    botConfig?.system_prompt ??
    (botConfig?.product as Product | null)?.default_prompt ??
    DEFAULT_SYSTEM_PROMPTS[ctx.productSlug] ??
    DEFAULT_SYSTEM_PROMPTS['support_bot']!;

  // 3. Merge guardrails
  const globalG   = (botCtx.platform_guardrails ?? null) as PlatformGuardrails | null;
  const botTypeG  = (botCtx.bot_type_guardrails ?? null) as LayeredGuardrailsConfig | null;
  const tenantG   = (botCtx.tenant_guardrails ?? null) as LayeredGuardrailsConfig | null;
  const clientBotG = botConfig?.guardrails_json ?? null;

  const systemPrompt = buildVoiceSystemPrompt(
    baseSystemPrompt, voiceCfg, globalG, botTypeG, tenantG, clientBotG, language, previousContext,
  );

  // 4. KB lookup
  const kbResults = await lookupKB(ctx.tenantId, ctx.productSlug, customerText);

  // 5. Build history as Message array for Claude
  const historyMessages: Message[] = conversationHistory
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const isCaller = line.startsWith('CALLER:');
      return {
        id:               '',
        conversation_id:  ctx.voiceCallId,
        role:             isCaller ? 'user' as const : 'assistant' as const,
        content:          line.replace(/^(CALLER:|BOT:)\s*/,''),
        media_url:        null,
        media_type:       null,
        whatsapp_msg_id:  null,
        confidence_score: null,
        delivery_status:  null,
        timestamp:        new Date().toISOString(),
      };
    });

  // 6. Call Claude Haiku — same function as WhatsApp bot
  const aiResult = await getAIResponse(systemPrompt, historyMessages, kbResults);
  const rawContent = aiResult.content;

  const shouldEnd =
    rawContent.includes(END_CALL_MARKER) ||
    turnNumber >= MAX_TURNS;

  const cleanContent = rawContent
    .replace(END_CALL_MARKER, '')
    .replace(/\[SALES_LEAD\]/g, '')
    .replace(/\[STAGE:\w+\]/g, '')
    .replace(/\[ENTITY:[^\]]+\]/g, '')
    .trimEnd();

  // 7. Synthesise response
  const ttsResult = await ctx.tts.synthesise({
    text:     cleanContent,
    language,
    voice:    voiceCfg.tts_voice ?? undefined,
  });

  const sayPart = ttsResult.twimlSaySnippet
    ? sayTag(ttsResult.twimlSaySnippet)
    : `<Play>${buildBase64AudioUrl(ttsResult.audioBase64 ?? '', ttsResult.audioMimeType ?? 'audio/mpeg')}</Play>`;

  // 8. Build TwiML
  let twiml: string;
  if (shouldEnd) {
    twiml = xmlResponse(sayPart, pauseTag(1), hangupTag());
  } else {
    twiml = xmlResponse(sayPart, pauseTag(1), recordTag(ctx.respondUrl));
  }

  const transcriptLine = `CALLER: ${customerText}\nBOT: ${cleanContent}`;

  return { twiml, transcriptLine, shouldEnd };
}

/**
 * Build TwiML for a missed call / voicemail scenario.
 */
export async function buildVoicemailTwiml(
  message: string,
  tts:      TtsProvider,
  language: string,
  voice?:   string,
): Promise<string> {
  const ttsResult = await tts.synthesise({ text: message, language, voice });
  const sayPart   = ttsResult.twimlSaySnippet
    ? sayTag(ttsResult.twimlSaySnippet)
    : `<Play>${buildBase64AudioUrl(ttsResult.audioBase64 ?? '', ttsResult.audioMimeType ?? 'audio/mpeg')}</Play>`;
  return xmlResponse(sayPart, hangupTag());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildBase64AudioUrl(base64: string, mimeType: string): string {
  // Twilio <Play> can reference a URL; for base64 we'd need to upload to Supabase Storage.
  // This is a placeholder — real implementation uploads and returns a signed URL.
  // For now we use twilio_say (free TTS) which avoids this path entirely.
  return `data:${mimeType};base64,${base64}`;
}

/** Store a completed call turn's transcript line back to voice_calls. */
export async function appendTranscript(voiceCallId: string, line: string): Promise<void> {
  const db = getServerClient();
  // Fetch current transcript and append
  const { data } = await db
    .from('voice_calls')
    .select('transcript, turn_count')
    .eq('id', voiceCallId)
    .single();

  const current   = (data as { transcript: string | null; turn_count: number } | null);
  const newText   = [current?.transcript, line].filter(Boolean).join('\n');
  const turnCount = (current?.turn_count ?? 0) + 1;

  await db
    .from('voice_calls')
    .update({ transcript: newText, turn_count: turnCount })
    .eq('id', voiceCallId);
}
