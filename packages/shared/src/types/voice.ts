// ─── Voice Provider Types ─────────────────────────────────────────────────────

export type VoiceProviderComponent = 'telephony' | 'stt' | 'tts';

export type TelephonyProviderName = 'twilio' | 'exotel';
export type SttProviderName       = 'deepgram' | 'sarvam' | 'azure_speech';
export type TtsProviderName       = 'twilio_say' | 'exotel_say' | 'google_tts' | 'sarvam_tts';
export type VoiceProviderName     = TelephonyProviderName | SttProviderName | TtsProviderName;

export interface VoiceProviderConfig {
  id:                          string;
  component:                   VoiceProviderComponent;
  provider_name:               VoiceProviderName;
  display_name:                string;
  credentials_json:            Record<string, string>;  // server-side only
  config_json:                 Record<string, unknown>;
  is_default:                  boolean;
  enabled:                     boolean;
  estimated_cost_per_min_inr:  number | null;
  created_at:                  string;
  updated_at:                  string;
}

/** Safe version sent to client (no credentials) */
export interface PublicVoiceProviderConfig extends Omit<VoiceProviderConfig, 'credentials_json'> {
  has_credentials: boolean;  // true if credentials_json is non-empty
}

// ─── Per-bot Voice Configuration ─────────────────────────────────────────────
// Stored as bot_configs.voice_config JSONB.
// null provider fields = inherit platform default.

export interface BotVoiceConfig {
  enabled:                        boolean;
  telephony_provider:             TelephonyProviderName | null;
  stt_provider:                   SttProviderName | null;
  tts_provider:                   TtsProviderName | null;
  language:                       string;            // BCP-47: 'en-IN', 'hi-IN', 'te-IN', etc.
  tts_voice:                      string | null;     // overrides provider default voice
  /** Message played when call is not answered (voicemail / missed call scenario) */
  voicemail_enabled:              boolean;
  voicemail_message:              string;
  /** Opening message spoken by bot when customer picks up */
  greeting_message:               string | null;     // null = use system prompt's welcome
  max_call_duration_seconds:      number;            // hard cap (default 300)
  max_turns:                      number;            // max conversation turns (default 20)
  silence_timeout_seconds:        number;            // end call after N seconds of silence
  /** Automatically dispatch a voice call when this bot's WhatsApp conversation is escalated */
  auto_dispatch_on_escalation:    boolean;
  /** Seconds to wait after escalation before calling (0 = immediate) */
  escalation_voice_delay_seconds: number;

  // ── Call Trigger Configuration ─────────────────────────────────────────────
  /** Trigger a call when the customer uses "call me" or configured keywords */
  trigger_on_call_request:        boolean;
  call_request_keywords:          string[];   // e.g. ["call me", "phone call", "speak to someone"]
  /** Trigger a call when the customer's message sentiment crosses the threshold */
  trigger_on_negative_sentiment:  boolean;
  negative_sentiment_threshold:   'negative' | 'frustrated';
  /** Trigger a call when the customer goes silent for N hours after bot's reply */
  trigger_on_no_reply:            boolean;
  no_reply_after_hours:           number;
  /** Gate all triggers to configured business hours */
  business_hours_only:            boolean;
  business_hours_start:           string;    // "09:00" (HH:mm in business_hours_timezone)
  business_hours_end:             string;    // "18:00"
  business_hours_timezone:        string;    // IANA tz e.g. "Asia/Kolkata"
  business_hours_days:            number[];  // 0=Sun 1=Mon … 6=Sat; default [1,2,3,4,5]
  /** Delay (seconds) between trigger firing and the call being placed */
  call_delay_seconds:             number;
}

// ─── Voice Call Log ───────────────────────────────────────────────────────────

export type VoiceCallStatus =
  | 'initiated' | 'ringing' | 'in_progress'
  | 'completed' | 'failed' | 'no_answer' | 'voicemail' | 'busy';

export type VoiceCallTrigger = 'escalation' | 'campaign' | 'manual' | 'inbound';
export type VoiceCallDirection = 'inbound' | 'outbound';

export interface VoiceCallOutcome {
  intent:             string;   // "product inquiry" | "complaint" | "order status" | ...
  product_interest:   string;   // product name or "none"
  resolved:           boolean;
  escalation_needed:  boolean;
  sentiment:          'positive' | 'neutral' | 'negative' | 'frustrated';
  follow_up_action:   string;   // "send quote" | "human follow-up" | "none"
  summary:            string;   // 1–2 sentence summary of the call
}

export interface VoiceCall {
  id:                  string;
  tenant_id:           string;
  conversation_id:     string | null;
  contact_id:          string | null;
  campaign_id:         string | null;

  direction:           VoiceCallDirection;
  from_number:         string;
  to_number:           string;
  product_slug:        string | null;

  telephony_provider:  TelephonyProviderName;
  telephony_call_sid:  string | null;
  stt_provider:        SttProviderName;
  tts_provider:        TtsProviderName;

  status:              VoiceCallStatus;
  duration_seconds:    number | null;
  turn_count:          number;
  recording_url:       string | null;
  transcript:          string | null;
  outcome_json:        VoiceCallOutcome | null;

  triggered_by:        VoiceCallTrigger;
  cost_rupees:         number | null;
  error_message:       string | null;

  created_at:          string;
  updated_at:          string;
}

// ─── Campaigns (extended with voice + channel) ────────────────────────────────

export type CampaignChannel   = 'whatsapp' | 'voice' | 'both';
export type CampaignStatusV2  = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';

export interface CampaignRetryConfig {
  auto_retry:               boolean;
  retry_limit:              number;
  retry_after_hours:        number;
  /** For 'both' channel: hours after WhatsApp send to dispatch voice if no reply */
  voice_after_wa_hours:     number;
}

export interface CampaignBothConfig {
  whatsapp_first:                    boolean;
  dispatch_voice_if_no_reply_hours:  number;
}

export interface CampaignStats {
  total:           number;
  wa_sent:         number;
  wa_replied:      number;
  wa_failed:       number;
  calls_made:      number;
  calls_answered:  number;
  calls_voicemail: number;
  calls_failed:    number;
}

export interface CampaignV2 {
  id:               string;
  tenant_id:        string;
  name:             string;
  channel:          CampaignChannel;
  product_slug:     string | null;
  status:           CampaignStatusV2;
  contact_count:    number;
  message_template: string | null;  // WhatsApp message body
  voice_script:     string | null;  // context injected into voice agent's call_context
  schedule_at:      string | null;
  timezone:         string;
  retry_config:     CampaignRetryConfig;
  both_config:      CampaignBothConfig | null;
  stats:            CampaignStats;
  created_at:       string;
  updated_at:       string;
}

// ─── Campaign Contact ─────────────────────────────────────────────────────────

export type CampaignContactWaStatus    = 'pending' | 'sent' | 'replied' | 'failed' | 'skipped';
export type CampaignContactVoiceStatus = 'pending' | 'initiated' | 'answered' | 'voicemail' | 'failed' | 'no_answer' | 'skipped';

export interface CampaignContactExtra {
  language?:         string;  // override language for this contact
  product_interest?: string;
  customer_segment?: string;
  [key: string]:     unknown;
}

export interface CampaignContact {
  id:               string;
  campaign_id:      string;
  tenant_id:        string;
  phone_number:     string;
  customer_name:    string | null;
  extra_data:       CampaignContactExtra;
  whatsapp_status:  CampaignContactWaStatus;
  voice_status:     CampaignContactVoiceStatus;
  voice_call_id:    string | null;
  outcome_json:     VoiceCallOutcome | null;
  attempts:         number;
  last_attempt_at:  string | null;
  created_at:       string;
}

// ─── API Request/Response shapes ─────────────────────────────────────────────

export interface DispatchCallRequest {
  tenant_id:        string;
  product_slug:     string;
  to_number:        string;           // E.164 e.g. +919876543210
  conversation_id?: string;
  contact_id?:      string;
  campaign_id?:     string;
  triggered_by?:    VoiceCallTrigger;
  call_context?:    Record<string, string>;  // extra info injected into agent greeting
}

export interface DispatchCallResponse {
  voice_call_id:    string;
  telephony_call_sid: string;
  status:           VoiceCallStatus;
}

export interface CreateCampaignRequest {
  name:             string;
  channel:          CampaignChannel;
  product_slug:     string;
  contacts:         Array<{ phone_number: string; customer_name?: string } & CampaignContactExtra>;
  message_template?: string;  // required if channel = 'whatsapp' | 'both'
  voice_script?:    string;   // required if channel = 'voice' | 'both'
  schedule_at?:     string;   // ISO datetime; null = launch immediately
  retry_config?:    Partial<CampaignRetryConfig>;
}
