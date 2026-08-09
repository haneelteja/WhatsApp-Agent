'use client';

import { useState, useTransition } from 'react';
import {
  Phone, CheckCircle2, Save, Eye, EyeOff, RefreshCw,
  ChevronDown, ChevronUp, Zap, Clock, Mic, MessageSquare,
} from 'lucide-react';
import { saveBotVoiceConfigAction } from '@/app/actions/bot-voice-config';
import {
  saveClientExotelCredsAction,
  saveClientFromNumberAction,
  fetchExotelNumbersAction,
} from '@/app/actions/tenant-voice-config';
import type { BotVoiceConfig } from '@alphabot/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BotVoiceConfigRow {
  product_slug: string;
  product_name: string;
  voice_config: Partial<BotVoiceConfig> | null;
}

export interface ExotelConfigRow {
  from_number:        string;
  has_exotel_creds:   boolean;
  exotel_account_sid: string | null;
}

export interface ClientVoiceConfigCardProps {
  bots:   BotVoiceConfigRow[];
  exotel: ExotelConfigRow | null;
}

// ─── Language + voice options ─────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'te-IN', label: 'Telugu' },
  { code: 'ta-IN', label: 'Tamil' },
  { code: 'kn-IN', label: 'Kannada' },
  { code: 'mr-IN', label: 'Marathi' },
  { code: 'en-US', label: 'English (US)' },
];

const VOICES = [
  { id: 'Polly.Raveena', label: 'Raveena — Indian English, Female',  lang: ['en-IN'] },
  { id: 'Polly.Kajal',   label: 'Kajal — Hindi Neural, Female (best)', lang: ['hi-IN', 'en-IN'] },
  { id: 'Polly.Aditi',   label: 'Aditi — Multi-lingual Indian, Female', lang: ['hi-IN', 'en-IN', 'te-IN', 'ta-IN', 'kn-IN', 'mr-IN'] },
  { id: 'Polly.Joanna',  label: 'Joanna — US English, Female',       lang: ['en-US', 'en-IN'] },
  { id: 'Polly.Joey',    label: 'Joey — US English, Male',            lang: ['en-US', 'en-IN'] },
];

// ─── Bot metadata ─────────────────────────────────────────────────────────────

const BOT_META: Record<string, { color: string; bg: string; border: string }> = {
  support_bot:   { color: 'text-sky-600',    bg: 'bg-sky-50',    border: 'border-sky-200'    },
  sales_bot:     { color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
  lifecycle_bot: { color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
};

// ─── Per-bot row ──────────────────────────────────────────────────────────────

function BotVoiceRow({ bot }: { bot: BotVoiceConfigRow }) {
  const cfg = bot.voice_config ?? {};
  const meta = BOT_META[bot.product_slug] ?? { color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' };

  const [enabled,         setEnabled]        = useState(cfg.enabled ?? false);
  const [autoDispatch,    setAutoDispatch]    = useState(cfg.auto_dispatch_on_escalation ?? false);
  const [escalationDelay, setEscalationDelay] = useState(cfg.escalation_voice_delay_seconds ?? 0);
  const [greeting,        setGreeting]        = useState(cfg.greeting_message ?? '');
  const [language,        setLanguage]        = useState(cfg.language ?? 'en-IN');
  const [ttsVoice,        setTtsVoice]        = useState(cfg.tts_voice ?? '');
  const [saved,           setSaved]           = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [isPending,       startTransition]    = useTransition();

  const filteredVoices = VOICES.filter(v => v.lang.includes(language));

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveBotVoiceConfigAction(bot.product_slug, {
        enabled,
        auto_dispatch_on_escalation:    autoDispatch,
        escalation_voice_delay_seconds: escalationDelay,
        greeting_message:               greeting.trim() || null,
        language,
        tts_voice:                      ttsVoice || null,
      });
      if (result.error) setError(result.error);
      else { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    });
  }

  return (
    <div className={`rounded-xl border ${meta.border} bg-white overflow-hidden`}>
      <div className={`flex items-center gap-3 px-4 py-3 ${meta.bg} border-b ${meta.border}`}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white border ${meta.border}`}>
          <Phone size={14} className={meta.color} />
        </div>
        <span className={`text-sm font-semibold ${meta.color}`}>{bot.product_name}</span>
        <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${enabled ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
          {enabled ? 'Voice On' : 'Voice Off'}
        </span>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Enable Voice */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-800">Enable voice calls</p>
            <p className="text-xs text-gray-400 mt-0.5">Allow this bot to make and receive AI voice calls</p>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(v => !v)}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1 ${
              enabled ? 'bg-emerald-500' : 'bg-gray-200'
            }`}
            aria-pressed={enabled}
          >
            <span className={`inline-block h-4 w-4 mt-0.5 ml-0.5 rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* Auto-dispatch on escalation */}
        {enabled && (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Zap size={13} className="text-amber-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-800">Auto-call on escalation</p>
                  <p className="text-xs text-gray-400 mt-0.5">Automatically dispatch a voice call when this bot escalates a conversation</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAutoDispatch(v => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1 ${
                  autoDispatch ? 'bg-emerald-500' : 'bg-gray-200'
                }`}
                aria-pressed={autoDispatch}
              >
                <span className={`inline-block h-4 w-4 mt-0.5 ml-0.5 rounded-full bg-white shadow transition-transform duration-200 ${autoDispatch ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>

            {autoDispatch && (
              <div className="flex items-center gap-3 pl-5">
                <Clock size={13} className="text-gray-400 shrink-0" />
                <label className="text-xs text-gray-500 shrink-0">Delay before calling</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    value={escalationDelay}
                    onChange={e => setEscalationDelay(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono"
                  />
                  <span className="text-xs text-gray-400">seconds</span>
                </div>
              </div>
            )}

            {/* Language + Voice */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
                  <Mic size={11} /> Language
                </label>
                <select
                  value={language}
                  onChange={e => { setLanguage(e.target.value); setTtsVoice(''); }}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
                >
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
                  <Phone size={11} /> Voice
                </label>
                <select
                  value={ttsVoice}
                  onChange={e => setTtsVoice(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
                >
                  <option value="">Auto (by language)</option>
                  {filteredVoices.map(v => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Greeting message */}
            <div>
              <label className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
                <MessageSquare size={11} /> Opening greeting
              </label>
              <textarea
                value={greeting}
                onChange={e => setGreeting(e.target.value)}
                rows={2}
                placeholder="Hello! This is Elma Water Industries. How can I help you today?"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none"
              />
              <p className="text-[11px] text-gray-400 mt-0.5">Spoken by the bot when the customer picks up. Leave blank to use system default.</p>
            </div>
          </>
        )}

        {/* Save */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Save size={12} />
            {isPending ? 'Saving…' : 'Save'}
          </button>
          {saved  && <span className="text-xs text-emerald-600 font-medium">Saved</span>}
          {error  && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Exotel section (optional, collapsed) ────────────────────────────────────

function ExotelSection({ initial }: { initial: ExotelConfigRow | null }) {
  const hasExistingCreds = initial?.has_exotel_creds ?? false;

  const [editCreds,    setEditCreds]    = useState(!hasExistingCreds);
  const [apiKey,       setApiKey]       = useState('');
  const [apiToken,     setApiToken]     = useState('');
  const [accountSid,   setAccountSid]   = useState(initial?.exotel_account_sid ?? '');
  const [showApiKey,   setShowApiKey]   = useState(false);
  const [showApiToken, setShowApiToken] = useState(false);
  const [credsSaved,   setCredsSaved]   = useState(false);
  const [credsError,   setCredsError]   = useState<string | null>(null);

  const [fromNumber,  setFromNumber]  = useState(initial?.from_number ?? '');
  const [numbers,     setNumbers]     = useState<{ phone_number: string; friendly_name: string }[]>([]);
  const [fetchedNums, setFetchedNums] = useState(false);
  const [numsError,   setNumsError]   = useState<string | null>(null);
  const [numSaved,    setNumSaved]    = useState(false);

  const [isPending, startTransition] = useTransition();

  function handleSaveCreds() {
    setCredsError(null);
    setCredsSaved(false);
    startTransition(async () => {
      const result = await saveClientExotelCredsAction({ api_key: apiKey, api_token: apiToken, account_sid: accountSid });
      if (result.error) setCredsError(result.error);
      else { setCredsSaved(true); setEditCreds(false); setApiKey(''); setApiToken(''); }
    });
  }

  function handleFetchNumbers() {
    setNumsError(null);
    startTransition(async () => {
      const result = await fetchExotelNumbersAction();
      if (result.error) setNumsError(result.error);
      else {
        setNumbers(result.numbers);
        setFetchedNums(true);
        if (result.numbers.length === 1) setFromNumber(result.numbers[0]!.phone_number);
      }
    });
  }

  function handleSaveNumber() {
    setNumSaved(false);
    startTransition(async () => {
      const result = await saveClientFromNumberAction(fromNumber);
      if (!result.error) { setNumSaved(true); setTimeout(() => setNumSaved(false), 3000); }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="text-sm font-semibold text-gray-800">Exotel Account</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Optionally connect your own Exotel account to call from your own number using your own credits — bypasses the platform provider.
          </p>
        </div>
        {hasExistingCreds && !editCreds && (
          <button type="button" onClick={() => setEditCreds(true)}
            className="text-[11px] text-emerald-600 hover:text-emerald-800 font-medium shrink-0">
            Update
          </button>
        )}
      </div>

      {!editCreds && hasExistingCreds ? (
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
          <div>
            <p className="font-medium text-emerald-800">Exotel connected</p>
            <p className="text-xs text-emerald-600 mt-0.5">Account: {initial?.exotel_account_sid}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">API Key</label>
              <div className="relative">
                <input type={showApiKey ? 'text' : 'password'} value={apiKey}
                  onChange={e => setApiKey(e.target.value)} placeholder="Exotel API key"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono" />
                <button type="button" onClick={() => setShowApiKey(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">API Token</label>
              <div className="relative">
                <input type={showApiToken ? 'text' : 'password'} value={apiToken}
                  onChange={e => setApiToken(e.target.value)} placeholder="Exotel API token"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono" />
                <button type="button" onClick={() => setShowApiToken(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showApiToken ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Account SID</label>
              <input type="text" value={accountSid} onChange={e => setAccountSid(e.target.value)}
                placeholder="Exotel account SID"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono" />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Exotel Dashboard → Account → API Credentials. Stored securely server-side only.
          </p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleSaveCreds}
              disabled={isPending || !apiKey || !apiToken || !accountSid}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
              <Save size={12} />
              {isPending ? 'Saving…' : 'Connect Exotel'}
            </button>
            {hasExistingCreds && (
              <button type="button" onClick={() => setEditCreds(false)}
                className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            )}
            {credsSaved && <span className="text-xs text-emerald-600 font-medium">Connected</span>}
            {credsError && <span className="text-xs text-red-600">{credsError}</span>}
          </div>
        </div>
      )}

      {/* Outbound caller ID */}
      <div>
        <p className="text-sm font-semibold text-gray-800 mb-1">Outbound Caller ID</p>
        <p className="text-xs text-gray-400 mb-3">
          The number shown to customers when your bot calls them (Exotel account number only).
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {fetchedNums && numbers.length > 0 ? (
            <select value={fromNumber} onChange={e => setFromNumber(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono bg-white min-w-[220px]">
              <option value="">— select a number —</option>
              {numbers.map(n => (
                <option key={n.phone_number} value={n.phone_number}>
                  {n.phone_number}{n.friendly_name !== n.phone_number ? ` (${n.friendly_name})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <input type="tel" value={fromNumber} onChange={e => setFromNumber(e.target.value)}
              placeholder="+91xxxxxxxxxx"
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono w-48" />
          )}
          <button type="button" onClick={handleFetchNumbers} disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors disabled:opacity-50">
            <RefreshCw size={12} className={isPending ? 'animate-spin' : ''} />
            Load my numbers
          </button>
          <button type="button" onClick={handleSaveNumber} disabled={isPending || !fromNumber}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors">
            <Save size={12} />
            {numSaved ? 'Saved' : 'Save Number'}
          </button>
        </div>
        {fromNumber && !fetchedNums && (
          <p className="text-xs text-gray-400 mt-1.5">Current: <span className="font-mono">{fromNumber}</span></p>
        )}
        {numsError && <p className="text-xs text-red-600 mt-1.5">{numsError}</p>}
      </div>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

export function ClientVoiceConfigCard({ bots, exotel }: ClientVoiceConfigCardProps) {
  const [showExotel, setShowExotel] = useState(exotel?.has_exotel_creds ?? false);

  return (
    <div className="space-y-6">
      {/* Platform status banner */}
      <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-800">Platform voice is active</p>
          <p className="text-xs text-emerald-600 mt-0.5">Twilio · Deepgram STT · AI voice calls ready</p>
        </div>
        <span className="text-xs font-mono text-emerald-600 bg-emerald-100 px-2 py-1 rounded-lg shrink-0">
          +1 (253) 799-1514
        </span>
      </div>

      {/* Per-bot settings */}
      {bots.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-6 text-center">
          <Phone size={20} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 font-medium">No active bots</p>
          <p className="text-xs text-gray-400 mt-1">Activate bots from the Workspace tab to configure voice.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Per-Bot Voice Settings</p>
          {bots.map(bot => <BotVoiceRow key={bot.product_slug} bot={bot} />)}
        </div>
      )}

      {/* Optional Exotel section */}
      <div className="border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => setShowExotel(v => !v)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors w-full text-left"
        >
          {showExotel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span className="font-medium">Connect your own Exotel account</span>
          <span className="text-xs text-gray-400 font-normal ml-1">(optional — use your own credits &amp; number)</span>
        </button>

        {showExotel && (
          <div className="mt-4">
            <ExotelSection initial={exotel} />
          </div>
        )}
      </div>
    </div>
  );
}
