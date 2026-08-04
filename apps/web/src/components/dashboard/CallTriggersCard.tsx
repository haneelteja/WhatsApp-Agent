'use client';

import { useState, useTransition } from 'react';
import { Save, Plus, X, CheckCircle2, Phone, Clock, AlertTriangle, MessageSquare } from 'lucide-react';
import { saveCallTriggersAction } from '@/app/actions/call-triggers';
import type { BotVoiceConfig } from '@alphabot/shared';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
];

const DEFAULT_KEYWORDS = ['call me', 'phone call', 'call back', 'call please', 'need a call'];

export interface CallTriggersCardProps {
  productSlug: string;
  botName:     string;
  badgeColor:  string;
  voiceCfg:    Partial<BotVoiceConfig>;
}

export function CallTriggersCard({ productSlug, botName, badgeColor, voiceCfg }: CallTriggersCardProps) {
  const [isPending, startTransition] = useTransition();
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // ── Keyword trigger ────────────────────────────────────────────────────────
  const [callRequest,    setCallRequest]    = useState(voiceCfg.trigger_on_call_request ?? false);
  const [keywords,       setKeywords]       = useState<string[]>(voiceCfg.call_request_keywords?.length ? voiceCfg.call_request_keywords : DEFAULT_KEYWORDS);
  const [kwInput,        setKwInput]        = useState('');

  // ── Sentiment trigger ──────────────────────────────────────────────────────
  const [sentimentTrig,  setSentimentTrig]  = useState(voiceCfg.trigger_on_negative_sentiment ?? false);
  const [sentThreshold,  setSentThreshold]  = useState<'negative' | 'frustrated'>(voiceCfg.negative_sentiment_threshold ?? 'frustrated');

  // ── No-reply trigger ───────────────────────────────────────────────────────
  const [noReplyTrig,    setNoReplyTrig]    = useState(voiceCfg.trigger_on_no_reply ?? false);
  const [noReplyHours,   setNoReplyHours]   = useState(voiceCfg.no_reply_after_hours ?? 2);

  // ── Business hours ─────────────────────────────────────────────────────────
  const [bizHoursOnly,   setBizHoursOnly]   = useState(voiceCfg.business_hours_only ?? false);
  const [bizStart,       setBizStart]       = useState(voiceCfg.business_hours_start ?? '09:00');
  const [bizEnd,         setBizEnd]         = useState(voiceCfg.business_hours_end ?? '18:00');
  const [bizTz,          setBizTz]          = useState(voiceCfg.business_hours_timezone ?? 'Asia/Kolkata');
  const [bizDays,        setBizDays]        = useState<number[]>(voiceCfg.business_hours_days?.length ? voiceCfg.business_hours_days : [1, 2, 3, 4, 5]);

  // ── Call delay ─────────────────────────────────────────────────────────────
  const [callDelay,      setCallDelay]      = useState(voiceCfg.call_delay_seconds ?? 0);

  function toggleDay(d: number) {
    setBizDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  }

  function addKeyword() {
    const kw = kwInput.trim().toLowerCase();
    if (kw && !keywords.includes(kw)) setKeywords(prev => [...prev, kw]);
    setKwInput('');
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveCallTriggersAction({
        productSlug,
        triggerOnCallRequest:       callRequest,
        callRequestKeywords:        keywords,
        triggerOnNegativeSentiment: sentimentTrig,
        negativeSentimentThreshold: sentThreshold,
        triggerOnNoReply:           noReplyTrig,
        noReplyAfterHours:          noReplyHours,
        businessHoursOnly:          bizHoursOnly,
        businessHoursStart:         bizStart,
        businessHoursEnd:           bizEnd,
        businessHoursTimezone:      bizTz,
        businessHoursDays:          bizDays,
        callDelaySeconds:           callDelay,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  const anyEnabled = callRequest || sentimentTrig || noReplyTrig;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badgeColor}`}>
            {botName}
          </span>
          {anyEnabled && (
            <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              {[callRequest && 'keyword', sentimentTrig && 'sentiment', noReplyTrig && 'no-reply'].filter(Boolean).join(' · ')} active
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
        >
          {saved
            ? <><CheckCircle2 size={14} /> Saved</>
            : isPending
            ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
            : <><Save size={14} /> Save</>
          }
        </button>
      </div>

      <div className="divide-y divide-gray-50">

        {/* ── Trigger 1: Customer says "call me" ──────────────────────────── */}
        <TriggerSection
          icon={<MessageSquare size={15} className="text-blue-500" />}
          title='Customer says "call me"'
          description="Dispatch a call when the customer's message contains a call-request keyword."
          enabled={callRequest}
          onToggle={() => setCallRequest(v => !v)}
        >
          {callRequest && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-500 font-medium">Keywords (case-insensitive)</p>
              <div className="flex flex-wrap gap-1.5">
                {keywords.map(kw => (
                  <span key={kw} className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                    {kw}
                    <button
                      type="button"
                      onClick={() => setKeywords(prev => prev.filter(k => k !== kw))}
                      className="hover:text-blue-900"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add keyword…"
                  value={kwInput}
                  onChange={e => setKwInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <button
                  type="button"
                  onClick={addKeyword}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <Plus size={13} /> Add
                </button>
              </div>
            </div>
          )}
        </TriggerSection>

        {/* ── Trigger 2: Negative sentiment ──────────────────────────────── */}
        <TriggerSection
          icon={<AlertTriangle size={15} className="text-amber-500" />}
          title="Negative / frustrated customer"
          description="Dispatch a call when the AI detects negative or frustrated sentiment in the customer's message."
          enabled={sentimentTrig}
          onToggle={() => setSentimentTrig(v => !v)}
        >
          {sentimentTrig && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 font-medium mb-2">Sensitivity</p>
              <div className="flex gap-2">
                {(['frustrated', 'negative'] as const).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSentThreshold(opt)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
                      sentThreshold === opt
                        ? 'bg-amber-50 border-amber-400 text-amber-700'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {opt === 'frustrated'
                      ? 'Frustrated only (stricter)'
                      : 'Negative or frustrated (broader)'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </TriggerSection>

        {/* ── Trigger 3: No reply ─────────────────────────────────────────── */}
        <TriggerSection
          icon={<Clock size={15} className="text-violet-500" />}
          title="Customer goes silent"
          description="Dispatch a call when the customer hasn't replied to the bot for a configured period."
          enabled={noReplyTrig}
          onToggle={() => setNoReplyTrig(v => !v)}
        >
          {noReplyTrig && (
            <div className="mt-3 flex items-center gap-3">
              <p className="text-xs text-gray-500 font-medium shrink-0">Call after</p>
              <input
                type="number"
                min={1}
                max={72}
                value={noReplyHours}
                onChange={e => setNoReplyHours(Math.max(1, Number(e.target.value)))}
                className="w-20 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300 text-center"
              />
              <p className="text-xs text-gray-500 font-medium shrink-0">hours of no reply</p>
            </div>
          )}
        </TriggerSection>

        {/* ── Business hours gate ─────────────────────────────────────────── */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">Business hours gate</p>
              <p className="text-xs text-gray-400 mt-0.5">Only allow call triggers during configured hours.</p>
            </div>
            <Toggle enabled={bizHoursOnly} onToggle={() => setBizHoursOnly(v => !v)} />
          </div>

          {bizHoursOnly && (
            <div className="space-y-3 pl-1 pt-1">
              {/* Day picker */}
              <div>
                <p className="text-xs text-gray-500 font-medium mb-1.5">Active days</p>
                <div className="flex gap-1">
                  {DAYS.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={`w-9 h-8 text-xs font-semibold rounded-lg border transition-colors ${
                        bizDays.includes(i)
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-gray-200 text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      {d.slice(0, 2)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time range */}
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">From</p>
                  <input
                    type="time"
                    value={bizStart}
                    onChange={e => setBizStart(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                </div>
                <p className="text-gray-400 text-sm mt-4">—</p>
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">To</p>
                  <input
                    type="time"
                    value={bizEnd}
                    onChange={e => setBizEnd(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 font-medium mb-1">Timezone</p>
                  <select
                    value={bizTz}
                    onChange={e => setBizTz(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Call delay ──────────────────────────────────────────────────── */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Delay before calling</p>
              <p className="text-xs text-gray-400 mt-0.5">Wait this many seconds after a trigger fires before placing the call.</p>
            </div>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <input
                type="number"
                min={0}
                max={300}
                value={callDelay}
                onChange={e => setCallDelay(Math.max(0, Number(e.target.value)))}
                className="w-20 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-300 text-center"
              />
              <span className="text-xs text-gray-500">sec</span>
            </div>
          </div>
        </div>

      </div>

      {error && (
        <div className="px-5 py-3 bg-red-50 border-t border-red-100 text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative w-10 h-5.5 rounded-full transition-colors shrink-0 ${enabled ? 'bg-emerald-500' : 'bg-gray-200'}`}
      style={{ height: '22px' }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: enabled ? 'translateX(18px)' : 'translateX(0)' }}
      />
    </button>
  );
}

function TriggerSection({
  icon, title, description, enabled, onToggle, children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={`px-5 py-4 transition-colors ${enabled ? 'bg-gray-50/50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-800">{title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{description}</p>
            </div>
            <Toggle enabled={enabled} onToggle={onToggle} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
