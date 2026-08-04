// Provider registry: loads voice_provider_configs from DB and instantiates
// the correct provider for each component (telephony / stt / tts).
// Providers are cached per process; cache is busted on each call in case
// platform manager updated credentials (TTL = 60 s).

import { getServerClient } from '@alphabot/database';
import type { BotVoiceConfig, TelephonyProviderName, SttProviderName, TtsProviderName } from '@alphabot/shared';
import type { TelephonyProvider, SttProvider, TtsProvider, ResolvedVoiceProviders } from './types.js';
import { createTwilioProvider }     from './providers/telephony/twilio.js';
import { createExotelProvider }     from './providers/telephony/exotel.js';
import { createDeepgramProvider }   from './providers/stt/deepgram.js';
import { createSarvamSttProvider }  from './providers/stt/sarvam.js';
import { createTwilioSayProvider }  from './providers/tts/twilio-say.js';
import { createExotelSayProvider }  from './providers/tts/exotel-say.js';
import { createGoogleTtsProvider }  from './providers/tts/google.js';

interface CachedEntry<T> { value: T; expiresAt: number }
const cache = new Map<string, CachedEntry<unknown>>();
const CACHE_TTL_MS = 60_000;

function fromCache<T>(key: string): T | undefined {
  const entry = cache.get(key) as CachedEntry<T> | undefined;
  if (entry && entry.expiresAt > Date.now()) return entry.value;
  cache.delete(key);
  return undefined;
}

function toCache<T>(key: string, value: T): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

interface DbProviderRow {
  component:        string;
  provider_name:    string;
  credentials_json: Record<string, string>;
  config_json:      Record<string, unknown>;
  is_default:       boolean;
  enabled:          boolean;
  estimated_cost_per_min_inr: number | null;
}

async function loadProviderRows(): Promise<DbProviderRow[]> {
  const cached = fromCache<DbProviderRow[]>('all_providers');
  if (cached) return cached;

  const db = getServerClient();
  const { data, error } = await db
    .from('voice_provider_configs')
    .select('component, provider_name, credentials_json, config_json, is_default, enabled, estimated_cost_per_min_inr')
    .eq('enabled', true);

  if (error) throw new Error(`Failed to load voice providers: ${error.message}`);
  const rows = (data ?? []) as DbProviderRow[];
  toCache('all_providers', rows);
  return rows;
}

function findRow(rows: DbProviderRow[], component: string, name?: string | null): DbProviderRow | undefined {
  if (name) return rows.find(r => r.component === component && r.provider_name === name);
  return rows.find(r => r.component === component && r.is_default);
}

function buildTelephony(
  row:          DbProviderRow,
  credOverride?: Record<string, string>,
): TelephonyProvider {
  const c   = credOverride ?? row.credentials_json;
  const cfg = row.config_json as Record<string, string>;

  switch (row.provider_name as TelephonyProviderName) {
    case 'twilio':
      return createTwilioProvider({ account_sid: c['account_sid']!, auth_token: c['auth_token']! });
    case 'exotel':
      return createExotelProvider({
        api_key:     c['api_key']!,
        api_token:   c['api_token']!,
        account_sid: c['account_sid']!,
        from_number: cfg['from_number'] ?? '',
        app_id:      cfg['app_id'] ?? '',
      });
    default:
      throw new Error(`Unknown telephony provider: ${row.provider_name}`);
  }
}

function buildStt(row: DbProviderRow): SttProvider {
  const c = row.credentials_json;
  const cfg = row.config_json as Record<string, string>;

  switch (row.provider_name as SttProviderName) {
    case 'deepgram':
      return createDeepgramProvider({ api_key: c['api_key']!, model: cfg['model'] });
    case 'sarvam':
      return createSarvamSttProvider({ api_key: c['api_key']!, model: cfg['model'], language_code: cfg['language_code'] });
    case 'azure_speech':
      throw new Error('Azure Speech STT not yet implemented — use deepgram or sarvam');
    default:
      throw new Error(`Unknown STT provider: ${row.provider_name}`);
  }
}

function buildTts(row: DbProviderRow): TtsProvider {
  const c = row.credentials_json;
  const cfg = row.config_json as Record<string, string>;

  switch (row.provider_name as TtsProviderName) {
    case 'twilio_say':
      return createTwilioSayProvider({ voice: cfg['voice'], language: cfg['language'], fallback_voice: cfg['fallback_voice'] });
    case 'exotel_say':
      return createExotelSayProvider({ voice: cfg['voice'], language: cfg['language'] });
    case 'google_tts':
      return createGoogleTtsProvider({ api_key: c['api_key']!, voice_name: cfg['voice_name'] });
    case 'sarvam_tts':
      throw new Error('Sarvam TTS not yet implemented — use exotel_say or google_tts');
    default:
      throw new Error(`Unknown TTS provider: ${row.provider_name}`);
  }
}

export interface TenantExotelCreds {
  api_key:     string;
  api_token:   string;
  account_sid: string;
}

/**
 * Resolve the set of voice providers for a single call, taking into account:
 *  1. bot voice_config overrides (per-bot preference)
 *  2. tenant-level Exotel credentials (if the client has their own account)
 *  3. platform defaults (from voice_provider_configs table)
 *
 * tenantFromNumber:  client's own caller ID — overrides platform config_json.from_number.
 * tenantExotelCreds: client's own Exotel API credentials — overrides platform credentials.
 *                    When present the client is completely isolated from the platform account.
 */
export async function resolveVoiceProviders(
  voiceConfig:        BotVoiceConfig,
  tenantFromNumber?:  string,
  tenantExotelCreds?: TenantExotelCreds,
): Promise<ResolvedVoiceProviders> {
  const rows = await loadProviderRows();

  const telephonyRow = findRow(rows, 'telephony', voiceConfig.telephony_provider);
  if (!telephonyRow) throw new Error('No enabled telephony provider found. Configure one in Platform Console → Voice.');

  const sttRow = findRow(rows, 'stt', voiceConfig.stt_provider);
  if (!sttRow) throw new Error('No enabled STT provider found. Configure one in Platform Console → Voice.');

  const ttsRow = findRow(rows, 'tts', voiceConfig.tts_provider);
  if (!ttsRow) throw new Error('No enabled TTS provider found. Configure one in Platform Console → Voice.');

  // Use tenant's own Exotel credentials if configured; else fall back to platform
  const telephony = buildTelephony(telephonyRow, tenantExotelCreds);
  const stt        = buildStt(sttRow);
  const tts        = buildTts(ttsRow);

  // Prefer the client's own number; fall back to platform config_json.from_number
  const platformFromNumber = (telephonyRow.config_json as Record<string, string>)['from_number'] ?? '';
  const fromNumber = tenantFromNumber?.trim() || platformFromNumber;

  return { telephony, stt, tts, fromNumber };
}

/** Estimate cost per minute for a given provider combination (shown in platform console). */
export async function estimateCostPerMin(voiceConfig: Partial<BotVoiceConfig>): Promise<{
  telephony_inr: number;
  stt_inr:       number;
  tts_inr:       number;
  llm_inr:       number;
  total_inr:     number;
}> {
  const rows = await loadProviderRows();

  const t = findRow(rows, 'telephony', voiceConfig.telephony_provider);
  const s = findRow(rows, 'stt', voiceConfig.stt_provider);
  const v = findRow(rows, 'tts', voiceConfig.tts_provider);

  const telephony_inr = t?.estimated_cost_per_min_inr ?? 1.08;
  const stt_inr       = s?.estimated_cost_per_min_inr ?? 0.36;
  const tts_inr       = v?.estimated_cost_per_min_inr ?? 0.00;
  const llm_inr       = 0.42;  // Claude Haiku ~5 turns/min

  return { telephony_inr, stt_inr, tts_inr, llm_inr, total_inr: telephony_inr + stt_inr + tts_inr + llm_inr };
}

/** Bust the provider cache (call after platform manager updates credentials). */
export function bustProviderCache(): void {
  cache.delete('all_providers');
}
