'use client';

import { useState, useTransition } from 'react';
import { MessageSquare, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { saveCallSummarySettings } from '@/app/actions/voice-call-summary';

export type CallSummaryInitial = {
  call_summary_enabled:    boolean;
  call_summary_wa_numbers: string[];
};

export function VoiceCallSummaryCard({ initial }: { initial: CallSummaryInitial | null }) {
  const [enabled,   setEnabled]   = useState(initial?.call_summary_enabled    ?? false);
  const [numbers,   setNumbers]   = useState<string[]>(initial?.call_summary_wa_numbers ?? []);
  const [newNumber, setNewNumber] = useState('');
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [pending,   startTransition] = useTransition();

  function addNumber() {
    const n = newNumber.trim();
    if (!n) return;
    if (!n.startsWith('+')) {
      setError('Number must be in international format, e.g. +919876543210');
      return;
    }
    if (numbers.includes(n)) {
      setError('This number is already in the list.');
      return;
    }
    setNumbers(prev => [...prev, n]);
    setNewNumber('');
    setError(null);
    setSaved(false);
  }

  function removeNumber(n: string) {
    setNumbers(prev => prev.filter(x => x !== n));
    setSaved(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveCallSummarySettings(enabled, numbers);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Master toggle */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-800">Send call summary after each call</p>
          <p className="text-xs text-gray-400 mt-0.5">
            When enabled, a WhatsApp message with the call outcome, intent, sentiment, and next steps
            is sent to your team immediately after every completed call.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setEnabled(e => !e); setSaved(false); }}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
            enabled ? 'bg-emerald-500' : 'bg-gray-200'
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </button>
      </div>

      {/* Preview of the message that will be sent */}
      <div className={`rounded-xl border p-4 text-xs space-y-0.5 transition-opacity ${enabled ? '' : 'opacity-40'}`}
           style={{ backgroundColor: '#ECF8F1', borderColor: '#d1f0e1', fontFamily: 'monospace' }}>
        <p className="font-bold text-gray-700 mb-1.5 font-sans text-[11px] uppercase tracking-wide">Message Preview</p>
        <p>📞 <strong>Voice Call Summary</strong></p>
        <p className="text-gray-400">&nbsp;</p>
        <p><strong>Caller:</strong> +91XXXXXXXXXX</p>
        <p><strong>Duration:</strong> 1m 30s · 3 turns</p>
        <p><strong>Status:</strong> ✅ Completed</p>
        <p className="text-gray-400">&nbsp;</p>
        <p><strong>Intent:</strong> product inquiry</p>
        <p><strong>Sentiment:</strong> 😊 positive</p>
        <p><strong>Resolved:</strong> ✅ Yes</p>
        <p><strong>Next steps:</strong> continue order process</p>
        <p className="text-gray-400">&nbsp;</p>
        <p><strong>Summary:</strong> Customer enquired about water bottle pricing and placed an order for 10 bottles.</p>
        <p className="text-gray-400">&nbsp;</p>
        <p className="text-sky-600">🔗 https://app.com/voice/&lt;call-id&gt;</p>
      </div>

      {/* Number list */}
      <div className={enabled ? '' : 'opacity-50 pointer-events-none'}>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          <MessageSquare size={11} />
          Team WhatsApp numbers
        </label>

        {numbers.length === 0 && (
          <p className="text-xs text-gray-400 italic mb-3">No numbers added yet.</p>
        )}

        <div className="space-y-2 mb-3">
          {numbers.map(n => (
            <div key={n} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
              <span className="text-sm font-mono text-gray-700">{n}</span>
              <button
                type="button"
                onClick={() => removeNumber(n)}
                className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-500 text-gray-400 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        {/* Add number */}
        <div className="flex gap-2">
          <input
            type="tel"
            value={newNumber}
            onChange={e => { setNewNumber(e.target.value); setError(null); }}
            onKeyDown={e => e.key === 'Enter' && addNumber()}
            placeholder="+919876543210"
            className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-gray-300"
          />
          <button
            type="button"
            onClick={addNumber}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl transition-colors"
          >
            <Plus size={13} />
            Add
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">International format required, e.g. +919876543210</p>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">{error}</p>
      )}

      {/* Save */}
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <CheckCircle2 size={13} />
            Saved
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="px-5 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}
