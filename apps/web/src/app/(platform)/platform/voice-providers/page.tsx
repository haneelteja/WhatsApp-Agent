export const dynamic = 'force-dynamic';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { Phone, Mic, Speaker } from 'lucide-react';
import { VoiceProviderCard, type VoiceProviderRow } from '@/components/platform/VoiceProviderCard';

const SECTION_META: Record<string, { label: string; description: string; icon: React.ElementType; color: string }> = {
  telephony: {
    label:       'Telephony',
    description: 'Handles outbound/inbound call routing and TwiML/ExoML execution.',
    icon:        Phone,
    color:       'text-sky-500',
  },
  stt: {
    label:       'Speech-to-Text (STT)',
    description: 'Transcribes the caller\'s voice recording after each turn.',
    icon:        Mic,
    color:       'text-violet-500',
  },
  tts: {
    label:       'Text-to-Speech (TTS)',
    description: 'Converts the AI response into voice audio played to the caller.',
    icon:        Speaker,
    color:       'text-amber-500',
  },
};

export default async function VoiceProvidersPage() {
  const admin = getSupabaseAdminClient();

  const { data: rows } = await admin
    .from('voice_provider_configs')
    .select('id, component, provider_name, display_name, credentials_json, config_json, is_default, enabled, estimated_cost_per_min_inr')
    .order('component')
    .order('is_default', { ascending: false });

  const providers = (rows ?? []) as VoiceProviderRow[];

  const byComponent: Record<string, VoiceProviderRow[]> = { telephony: [], stt: [], tts: [] };
  for (const p of providers) {
    (byComponent[p.component] ??= []).push(p);
  }

  // Derive current stack cost estimate
  const defaultTelephony = providers.find(p => p.component === 'telephony' && p.is_default);
  const defaultStt       = providers.find(p => p.component === 'stt'       && p.is_default);
  const defaultTts       = providers.find(p => p.component === 'tts'       && p.is_default);

  const stackCost = [defaultTelephony, defaultStt, defaultTts]
    .reduce((sum, p) => sum + parseFloat(p?.estimated_cost_per_min_inr ?? '0'), 0);

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Voice Providers</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure telephony, STT, and TTS providers for voice call AI.
          </p>
        </div>

        {/* Stack cost card */}
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-right">
          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Default stack</p>
          <p className="text-xl font-bold tabular-nums text-slate-800 mt-0.5">₹{stackCost.toFixed(2)}<span className="text-sm font-medium text-slate-400">/min</span></p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {[defaultTelephony?.display_name, defaultStt?.display_name, defaultTts?.display_name]
              .filter(Boolean).join(' + ') || 'No defaults set'}
          </p>
        </div>
      </div>

      {/* How-to callout */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-sm text-indigo-700">
        <p className="font-semibold mb-1">Setup checklist</p>
        <ol className="list-decimal list-inside space-y-1 text-xs text-indigo-600">
          <li>Enter credentials for your Telephony provider (Exotel or Twilio) → Enable it → Set as Default</li>
          <li>Enter credentials for your STT provider (Sarvam or Deepgram) → Enable it → Set as Default</li>
          <li>TTS is free with ExotelSay — just enable it and set as Default</li>
          <li>Enable Voice in each bot&apos;s Guardrails settings, set a greeting and language</li>
        </ol>
      </div>

      {/* Provider sections */}
      {(['telephony', 'stt', 'tts'] as const).map(component => {
        const meta = SECTION_META[component]!;
        const Icon = meta.icon;
        return (
          <section key={component} className="space-y-3">
            <div className="flex items-center gap-2">
              <Icon size={15} className={meta.color} />
              <h3 className="text-sm font-bold text-slate-700">{meta.label}</h3>
              <p className="text-xs text-slate-400">— {meta.description}</p>
            </div>
            {(byComponent[component] ?? []).length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-2xl">
                No providers registered.
              </p>
            ) : (
              <div className="space-y-2">
                {(byComponent[component] ?? []).map(p => (
                  <VoiceProviderCard key={p.id} provider={p} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
