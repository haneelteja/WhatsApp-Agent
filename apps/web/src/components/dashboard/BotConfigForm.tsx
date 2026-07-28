'use client';

import { useState, useTransition } from 'react';
import { Bot, ChevronDown, ChevronUp, Save, Phone } from 'lucide-react';
import { saveBotConfigAction } from '@/app/actions/bot-config';
import type { BotConfig, GuardrailsConfig, BotVoiceConfig, Product } from '@alphabot/shared';

type ResolvedConfig = BotConfig & { product: Product | null };

const PRODUCT_LABELS: Record<string, string> = {
  support_bot:   'Support Bot',
  sales_bot:     'Sales Bot',
  lifecycle_bot: 'Lifecycle Bot',
};

const PRODUCT_COLORS: Record<string, string> = {
  support_bot:   'bg-sky-50 text-sky-700 border-sky-200',
  sales_bot:     'bg-violet-50 text-violet-700 border-violet-200',
  lifecycle_bot: 'bg-orange-50 text-orange-700 border-orange-200',
};

function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  function add() {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setInput('');
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300"
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 text-sm bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 font-medium"
        >
          Add
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full"
            >
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                className="text-gray-400 hover:text-gray-700 leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const LANGUAGE_OPTIONS = [
  { value: 'en-IN', label: 'English (India)' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'ta-IN', label: 'Tamil' },
  { value: 'te-IN', label: 'Telugu' },
  { value: 'kn-IN', label: 'Kannada' },
  { value: 'mr-IN', label: 'Marathi' },
  { value: 'gu-IN', label: 'Gujarati' },
  { value: 'ml-IN', label: 'Malayalam' },
  { value: 'en-US', label: 'English (US)' },
];

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={`${label}: ${value ? 'on' : 'off'}`}
      title={label}
      onClick={() => onChange(!value)}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${value ? 'bg-emerald-500' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function BotCard({ config, defaultPrompt }: { config: ResolvedConfig; defaultPrompt: string }) {
  const g  = config.guardrails_json as GuardrailsConfig;
  const vc = (config.voice_config ?? {}) as Partial<BotVoiceConfig>;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [systemPrompt,        setSystemPrompt]        = useState(config.system_prompt ?? '');
  const [kbOnly,               setKbOnly]               = useState(config.kb_only_mode ?? false);
  const [confidence,           setConfidence]           = useState(config.confidence_threshold);
  const [escalationTriggers,   setEscalationTriggers]   = useState<string[]>(config.escalation_triggers ?? []);
  const [tone,                 setTone]                 = useState<GuardrailsConfig['tone']>(g?.tone ?? 'professional');
  const [maxLength,            setMaxLength]            = useState(g?.max_response_length ?? 1000);
  const [blockedTopics,        setBlockedTopics]        = useState<string[]>(g?.blocked_topics ?? []);
  const [blockedKeywords,      setBlockedKeywords]      = useState<string[]>(g?.blocked_keywords ?? []);
  const [noLinks,              setNoLinks]              = useState(g?.content_filters?.no_external_links ?? false);
  const [noPersonalData,       setNoPersonalData]       = useState(g?.content_filters?.no_personal_data ?? false);
  const [noPhoneNumbers,       setNoPhoneNumbers]       = useState(g?.content_filters?.no_phone_numbers_in_response ?? false);
  const [onBlocked,            setOnBlocked]            = useState<GuardrailsConfig['on_blocked_topic']>(g?.on_blocked_topic ?? 'escalate');
  const [customBlockedMessage, setCustomBlockedMessage] = useState(g?.custom_blocked_message ?? '');
  // Voice config state
  const [voiceEnabled,         setVoiceEnabled]         = useState(vc.enabled ?? false);
  const [voiceLanguage,        setVoiceLanguage]        = useState(vc.language ?? 'hi-IN');
  const [voiceGreeting,        setVoiceGreeting]        = useState(vc.greeting_message ?? '');
  const [voiceVoicemail,       setVoiceVoicemail]       = useState(vc.voicemail_message ?? 'We missed your call. Our AI assistant will call you back shortly.');
  const [autoDispatch,         setAutoDispatch]         = useState(vc.auto_dispatch_on_escalation ?? false);
  const [dispatchDelay,        setDispatchDelay]        = useState(vc.escalation_voice_delay_seconds ?? 0);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveBotConfigAction({
        productSlug:          config.product_slug,
        systemPrompt,
        kbOnlyMode:           kbOnly,
        confidenceThreshold:  confidence,
        escalationTriggers,
        tone,
        maxResponseLength:    maxLength,
        blockedTopics,
        blockedKeywords,
        noExternalLinks:      noLinks,
        noPersonalData,
        noPhoneNumbers,
        onBlockedTopic:       onBlocked,
        customBlockedMessage,
        voiceEnabled,
        voiceLanguage,
        voiceGreeting,
        voiceVoicemail,
        autoDispatchOnEscalation: autoDispatch,
        escalationVoiceDelaySeconds: dispatchDelay,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  const colorClass = PRODUCT_COLORS[config.product_slug] ?? 'bg-gray-50 text-gray-700 border-gray-200';

  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Bot size={15} className="text-emerald-600" />
          <span className="font-semibold text-sm text-gray-800">
            {PRODUCT_LABELS[config.product_slug] ?? config.product_slug}
          </span>
          <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium border ${colorClass}`}>
            {config.product_slug.replace(/_/g, ' ')}
          </span>
          {kbOnly && (
            <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-amber-50 text-amber-700 border border-amber-200">
              KB-only
            </span>
          )}
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 bg-white px-5 py-5 space-y-6">
          {/* System Prompt */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
              System Prompt
            </label>
            <p className="text-xs text-gray-400">
              Custom instructions for this bot. Leave empty to use the product default.
            </p>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              placeholder={defaultPrompt}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-y font-mono"
            />
          </div>

          {/* KB-only mode */}
          <div className="flex items-start justify-between gap-4 p-4 bg-amber-50 rounded-xl border border-amber-100">
            <div>
              <p className="text-sm font-semibold text-amber-800">Knowledge Base Only Mode</p>
              <p className="text-xs text-amber-600 mt-0.5">
                When enabled, the bot will only answer using KB entries. Questions outside the KB get an escalation offer.
              </p>
            </div>
            <button
              type="button"
              aria-label={`Knowledge Base Only Mode: ${kbOnly ? 'on' : 'off'}`}
              title="Toggle Knowledge Base Only Mode"
              onClick={() => setKbOnly((v) => !v)}
              className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${kbOnly ? 'bg-amber-500' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${kbOnly ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Tone + Confidence */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor={`tone-${config.product_slug}`} className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tone</label>
              <select
                id={`tone-${config.product_slug}`}
                value={tone}
                onChange={(e) => setTone(e.target.value as GuardrailsConfig['tone'])}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              >
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="empathetic">Empathetic</option>
                <option value="formal">Formal</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`confidence-${config.product_slug}`} className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Confidence Threshold
              </label>
              <div className="flex items-center gap-3">
                <input
                  id={`confidence-${config.product_slug}`}
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={confidence}
                  onChange={(e) => setConfidence(parseFloat(e.target.value))}
                  className="flex-1 accent-emerald-500"
                />
                <span className="text-sm font-mono text-gray-700 w-10 text-right">{confidence.toFixed(2)}</span>
              </div>
              <p className="text-xs text-gray-400">Escalate if AI confidence falls below this</p>
            </div>
          </div>

          {/* Max response length */}
          <div className="space-y-1.5">
            <label htmlFor={`maxlength-${config.product_slug}`} className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Max Response Length (characters)
            </label>
            <input
              id={`maxlength-${config.product_slug}`}
              type="number"
              min={100}
              max={4000}
              value={maxLength}
              onChange={(e) => setMaxLength(parseInt(e.target.value, 10))}
              className="w-40 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
          </div>

          {/* Blocked topics */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Blocked Topics
            </label>
            <p className="text-xs text-gray-400">Bot will refuse to discuss these topics (press Enter or Add).</p>
            <TagInput value={blockedTopics} onChange={setBlockedTopics} placeholder="e.g. competitor pricing" />
          </div>

          {/* Blocked keywords */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Blocked Keywords
            </label>
            <p className="text-xs text-gray-400">
              If an incoming message contains any of these words, it will be blocked before reaching the AI.
            </p>
            <TagInput value={blockedKeywords} onChange={setBlockedKeywords} placeholder="e.g. lawsuit" />
          </div>

          {/* On blocked topic */}
          <div className="space-y-1.5">
            <label htmlFor={`onblocked-${config.product_slug}`} className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
              When Blocked Keyword Detected
            </label>
            <select
              id={`onblocked-${config.product_slug}`}
              value={onBlocked}
              onChange={(e) => setOnBlocked(e.target.value as GuardrailsConfig['on_blocked_topic'])}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            >
              <option value="escalate">Escalate to human agent</option>
              <option value="ignore">Send custom message (no escalation)</option>
            </select>
            {onBlocked === 'ignore' && (
              <input
                type="text"
                value={customBlockedMessage}
                onChange={(e) => setCustomBlockedMessage(e.target.value)}
                placeholder="I'm sorry, I can't help with that topic."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 mt-2"
              />
            )}
          </div>

          {/* Escalation triggers */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Escalation Trigger Phrases
            </label>
            <p className="text-xs text-gray-400">Conversations containing these phrases are immediately escalated to a human.</p>
            <TagInput value={escalationTriggers} onChange={setEscalationTriggers} placeholder="e.g. speak to human" />
          </div>

          {/* Content filters */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Content Filters</label>
            {[
              { label: 'No external links in responses', value: noLinks,         set: setNoLinks         },
              { label: 'No personal data in responses',  value: noPersonalData,  set: setNoPersonalData  },
              { label: 'No phone numbers in responses',  value: noPhoneNumbers,  set: setNoPhoneNumbers  },
            ].map(({ label, value, set }) => (
              <label key={label} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => set(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}
          </div>

          {/* ── Voice Config ───────────────────────────────────────────────── */}
          <div className="rounded-xl border border-sky-100 bg-sky-50/50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-sky-100">
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-sky-600" />
                <span className="text-xs font-semibold text-sky-800 uppercase tracking-wide">Voice Call Config</span>
              </div>
              <Toggle
                value={voiceEnabled}
                onChange={setVoiceEnabled}
                label="Enable Voice Calls for this bot"
              />
            </div>

            {voiceEnabled && (
              <div className="px-4 py-4 space-y-4">
                {/* Language */}
                <div className="space-y-1.5">
                  <label htmlFor={`voice-lang-${config.product_slug}`} className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Call Language
                  </label>
                  <select
                    id={`voice-lang-${config.product_slug}`}
                    value={voiceLanguage}
                    onChange={(e) => setVoiceLanguage(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300"
                  >
                    {LANGUAGE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400">Language used for STT transcription and TTS speech synthesis.</p>
                </div>

                {/* Greeting */}
                <div className="space-y-1.5">
                  <label htmlFor={`voice-greeting-${config.product_slug}`} className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Opening Greeting
                  </label>
                  <textarea
                    id={`voice-greeting-${config.product_slug}`}
                    value={voiceGreeting}
                    onChange={(e) => setVoiceGreeting(e.target.value)}
                    rows={2}
                    placeholder="Hello! I'm your support assistant. How can I help you today?"
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none"
                  />
                  <p className="text-xs text-gray-400">First sentence spoken when the customer answers. Leave empty for the system default.</p>
                </div>

                {/* Voicemail */}
                <div className="space-y-1.5">
                  <label htmlFor={`voice-voicemail-${config.product_slug}`} className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Voicemail / No-Answer Message
                  </label>
                  <textarea
                    id={`voice-voicemail-${config.product_slug}`}
                    value={voiceVoicemail}
                    onChange={(e) => setVoiceVoicemail(e.target.value)}
                    rows={2}
                    placeholder="We missed your call. Our AI assistant will call you back shortly."
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none"
                  />
                  <p className="text-xs text-gray-400">Played when the call is not answered (if voicemail is enabled by the provider).</p>
                </div>

                {/* Auto-dispatch on escalation */}
                <div className="flex items-start justify-between gap-4 p-3 bg-white rounded-xl border border-sky-100">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Auto-call on WhatsApp Escalation</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      When a WhatsApp conversation is escalated, immediately dispatch an AI voice callback to the customer.
                    </p>
                  </div>
                  <Toggle
                    value={autoDispatch}
                    onChange={setAutoDispatch}
                    label="Auto-dispatch voice call on escalation"
                  />
                </div>

                {autoDispatch && (
                  <div className="space-y-1.5">
                    <label htmlFor={`voice-delay-${config.product_slug}`} className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Call Delay After Escalation (seconds)
                    </label>
                    <input
                      id={`voice-delay-${config.product_slug}`}
                      type="number"
                      min={0}
                      max={300}
                      value={dispatchDelay}
                      onChange={(e) => setDispatchDelay(parseInt(e.target.value, 10) || 0)}
                      className="w-32 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300"
                    />
                    <p className="text-xs text-gray-400">0 = call immediately. Use a delay (e.g. 30s) to let the WhatsApp acknowledgment arrive first.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Save */}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <Save size={14} />
              {pending ? 'Saving…' : 'Save Configuration'}
            </button>
            {saved && <span className="text-sm text-emerald-600 font-medium">Saved!</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export function BotConfigForm({
  configs,
  productDefaults,
}: {
  configs: ResolvedConfig[];
  productDefaults: Record<string, string>;
}) {
  if (!configs.length) {
    return (
      <p className="text-sm text-gray-400 px-5 py-4">No bot products activated.</p>
    );
  }

  return (
    <div className="space-y-3">
      {configs.map((c) => (
        <BotCard
          key={c.product_slug}
          config={c}
          defaultPrompt={productDefaults[c.product_slug] ?? ''}
        />
      ))}
    </div>
  );
}
