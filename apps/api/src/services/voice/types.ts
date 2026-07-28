// Voice provider abstraction interfaces.
// Every provider component implements one of these interfaces so the pipeline
// can swap Twilio ↔ Exotel, Deepgram ↔ Sarvam, etc. with a config change.

import type {
  TelephonyProviderName,
  SttProviderName,
  TtsProviderName,
  VoiceCallStatus,
} from '@alphabot/shared';

// ─── Telephony Provider ───────────────────────────────────────────────────────

export interface OutboundCallParams {
  to:              string;          // E.164 customer number
  from:            string;          // our number
  twimlUrl:        string;          // URL Twilio hits when call is answered
  statusCallback:  string;          // URL for call status updates
  callSid?:        string;          // pre-assigned ID (for internal tracking before actual SID arrives)
}

export interface OutboundCallResult {
  callSid:   string;          // telephony-assigned call ID
  status:    VoiceCallStatus;
}

export interface TelephonyProvider {
  readonly name: TelephonyProviderName;
  /** Initiate an outbound call. Returns immediately; conversation happens via webhooks. */
  dispatch(params: OutboundCallParams): Promise<OutboundCallResult>;
  /** Cancel/end a call by SID. */
  hangup(callSid: string): Promise<void>;
  /** Validate that credentials work. Returns true if valid. */
  validate(): Promise<boolean>;
}

// ─── STT Provider ─────────────────────────────────────────────────────────────

export interface TranscribeParams {
  /** URL of audio recording (Twilio recording URL, etc.) */
  recordingUrl:  string;
  /** Auth header value for fetching the recording URL (e.g. Basic base64). Passed in fetch. */
  recordingAuth?: string;
  language:      string;   // BCP-47
  /** Raw audio buffer if URL is not available */
  audioBuffer?:  Buffer;
  audioMimeType?: string;  // 'audio/wav' | 'audio/mpeg' | 'audio/ogg' etc.
}

export interface TranscribeResult {
  transcript:  string;
  confidence:  number;   // 0–1
  language:    string;   // detected or requested
  durationMs:  number;
}

export interface SttProvider {
  readonly name: SttProviderName;
  transcribe(params: TranscribeParams): Promise<TranscribeResult>;
  validate(): Promise<boolean>;
}

// ─── TTS Provider ─────────────────────────────────────────────────────────────

export interface SynthesiseParams {
  text:        string;
  language:    string;    // BCP-47
  voice?:      string;    // provider-specific voice ID/name
  speakingRate?: number;  // 0.5–2.0
}

export interface SynthesiseResult {
  /** Base64-encoded audio (for Twilio <Play> or inline TwiML). Null for twilio_say. */
  audioBase64?: string;
  audioMimeType?: string;    // 'audio/mpeg' | 'audio/wav'
  /** For twilio_say: the TwiML <Say> XML snippet to embed directly */
  twimlSaySnippet?: string;
}

export interface TtsProvider {
  readonly name: TtsProviderName;
  synthesise(params: SynthesiseParams): Promise<SynthesiseResult>;
  validate(): Promise<boolean>;
}

// ─── Resolved provider set for a single call ─────────────────────────────────

export interface ResolvedVoiceProviders {
  telephony:  TelephonyProvider;
  stt:        SttProvider;
  tts:        TtsProvider;
  fromNumber: string;
}
