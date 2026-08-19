'use client';

import { useState, useTransition } from 'react';
import { Loader2, Save, MessageSquare, Clock, RefreshCw } from 'lucide-react';
import { saveSalesConfigAction } from '@/app/actions/sales-config';
import type { SalesConfig } from '@alphabot/shared';

const DEFAULT_MESSAGES = [
  'Hi {name}! Just checking in — do you have any questions about our products? We\'d love to help you find the right fit.',
  'Following up on your enquiry, {name}. Our team is ready to assist. Would you like more details or a quote?',
  'Last follow-up from us, {name} — our offer still stands. Let us know whenever you\'re ready to proceed!',
];

interface Props {
  initial: Partial<SalesConfig> | null;
}

export function SalesFollowUpForm({ initial }: Props) {
  const [enabled,     setEnabled]     = useState(initial?.lead_follow_up_enabled ?? false);
  const [delayHours,  setDelayHours]  = useState(initial?.lead_follow_up_delay_hours ?? 4);
  const [messages,    setMessages]    = useState<string[]>(
    initial?.lead_follow_up_messages?.length
      ? initial.lead_follow_up_messages
      : DEFAULT_MESSAGES,
  );
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [saving,   setSaving]   = useState(false);

  function updateMsg(idx: number, val: string) {
    setMessages(prev => prev.map((m, i) => i === idx ? val : m));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const result = await saveSalesConfigAction({
      lead_follow_up_enabled:      enabled,
      lead_follow_up_delay_hours:  delayHours,
      lead_follow_up_messages:     messages.filter(m => m.trim()),
    });

    setSaving(false);
    if (result.error) {
      setError(result.error);
    } else {
      startTransition(() => setSaved(true));
      setTimeout(() => setSaved(false), 3000);
    }
  }

  return (
    <div className="space-y-5">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">Enable Lead Follow-ups</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Automatically message sales leads who go quiet — up to 3 follow-ups per lead
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(e => !e)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
            enabled ? 'bg-violet-600' : 'bg-slate-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Delay */}
      <div className={`space-y-1.5 transition-opacity ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <Clock size={12} className="text-violet-500" />
          Hours of silence before first follow-up
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={168}
            value={delayHours}
            onChange={e => setDelayHours(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-24 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400 text-slate-800 tabular-nums"
          />
          <span className="text-xs text-slate-400">
            {delayHours < 24
              ? `${delayHours}h — checks every 2 hours`
              : `${Math.round(delayHours / 24)}d ${delayHours % 24 > 0 ? `${delayHours % 24}h` : ''} — checks every 2 hours`}
          </span>
        </div>
        <p className="text-[11px] text-slate-400">
          The same delay is applied between each subsequent follow-up
        </p>
      </div>

      {/* Messages */}
      <div className={`space-y-3 transition-opacity ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <MessageSquare size={12} className="text-violet-500" />
          Follow-up messages (sent in order, max 3)
        </label>
        <p className="text-[11px] text-slate-400 -mt-1">
          Use <code className="bg-slate-100 px-1 rounded text-[10px]">{'{name}'}</code> to insert the customer&apos;s first name
        </p>

        {[0, 1, 2].map(idx => (
          <div key={idx} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                idx === 0 ? 'bg-violet-100 text-violet-700'
                : idx === 1 ? 'bg-amber-100 text-amber-700'
                : 'bg-orange-100 text-orange-700'
              }`}>
                Follow-up {idx + 1}
              </span>
              {idx === 2 && (
                <span className="text-[10px] text-slate-400">After this, lead is marked cold</span>
              )}
            </div>
            <textarea
              rows={2}
              value={messages[idx] ?? ''}
              onChange={e => updateMsg(idx, e.target.value)}
              placeholder={`Follow-up message ${idx + 1}…`}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 text-slate-800 leading-relaxed"
            />
            <p className="text-[10px] text-slate-400 text-right">
              {(messages[idx] ?? '').length} chars
            </p>
          </div>
        ))}
      </div>

      {/* Info box */}
      <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 space-y-1">
        <div className="flex items-center gap-1.5">
          <RefreshCw size={11} className="text-violet-500" />
          <p className="text-[11px] font-semibold text-violet-800">How sales follow-ups work</p>
        </div>
        <ul className="list-disc ml-4 space-y-0.5 text-[11px] text-violet-700">
          <li>Only applies to conversations where a <strong>sales lead</strong> was detected</li>
          <li>Checks every 2 hours — sends a follow-up if the lead has been quiet for the configured hours</li>
          <li>Stops after 3 follow-ups; the lead remains on the board for manual action</li>
          <li>Resolved or already-replied leads are automatically skipped</li>
        </ul>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {saving
            ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
            : <><Save size={14} /> Save changes</>
          }
        </button>
        {saved && (
          <span className="text-xs text-emerald-600 font-semibold">
            ✓ Saved
          </span>
        )}
        {error && (
          <span className="text-xs text-red-500">{error}</span>
        )}
      </div>
    </div>
  );
}
