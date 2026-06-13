'use client';

import { useState, useTransition } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { saveFollowUpConfigAction } from '@/app/actions/follow-up';

interface Props {
  productSlug:      string;
  productName:      string;
  accent:           string;
  initialEnabled:   boolean;
  initialIdleDays:  number;
  initialTemplate:  string;
  initialMaxSends:  number;
}

const DEFAULT_TEMPLATE = "Hi {name}! We noticed you haven't been in touch for a while. Is there anything we can help you with today?";

export function FollowUpForm({
  productSlug,
  productName,
  accent,
  initialEnabled,
  initialIdleDays,
  initialTemplate,
  initialMaxSends,
}: Props) {
  const [pending,  startTransition] = useTransition();
  const [saved,    setSaved]        = useState(false);
  const [error,    setError]        = useState<string | null>(null);

  const [enabled,  setEnabled]  = useState(initialEnabled);
  const [idleDays, setIdleDays] = useState(initialIdleDays);
  const [template, setTemplate] = useState(initialTemplate || DEFAULT_TEMPLATE);
  const [maxSends, setMaxSends] = useState(initialMaxSends);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await saveFollowUpConfigAction(productSlug, {
        enabled,
        idle_days:        idleDays,
        message_template: template,
        max_follow_ups:   maxSends,
      });
      if ('error' in res && res.error) {
        setError(res.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Enable toggle */}
      <div className={`flex items-center justify-between p-4 rounded-xl border ${enabled ? `bg-${accent}-50 border-${accent}-200` : 'bg-slate-50 border-slate-200'}`}>
        <div>
          <p className={`text-sm font-semibold ${enabled ? `text-${accent}-800` : 'text-slate-700'}`}>
            Auto Follow-up
          </p>
          <p className={`text-xs mt-0.5 ${enabled ? `text-${accent}-600` : 'text-slate-400'}`}>
            {enabled
              ? `Bot will message idle customers after ${idleDays} day${idleDays !== 1 ? 's' : ''}`
              : 'Enable to have the bot automatically follow up with idle customers'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(v => !v)}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-300 ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Config fields — always visible so user can configure before enabling */}
      <div className="grid grid-cols-2 gap-4">
        {/* Idle days */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Idle Days
          </label>
          <p className="text-xs text-gray-400">Follow up after this many days of silence</p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={30}
              value={idleDays}
              onChange={e => setIdleDays(Number(e.target.value))}
              className="flex-1 accent-emerald-500"
            />
            <span className="text-sm font-mono font-semibold text-gray-700 w-8 text-right">{idleDays}d</span>
          </div>
        </div>

        {/* Max follow-ups */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Max Follow-ups
          </label>
          <p className="text-xs text-gray-400">Per conversation before stopping</p>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setMaxSends(n)}
                className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors ${maxSends === n ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Message template */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Follow-up Message
        </label>
        <p className="text-xs text-gray-400">
          Use <code className="font-mono bg-slate-100 px-1 rounded text-gray-600">{'{name}'}</code> to personalise with the customer&apos;s first name.
        </p>
        <textarea
          value={template}
          onChange={e => setTemplate(e.target.value)}
          rows={3}
          placeholder={DEFAULT_TEMPLATE}
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-y font-mono"
        />
        <button
          type="button"
          onClick={() => setTemplate(DEFAULT_TEMPLATE)}
          className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
        >
          <RefreshCw size={10} />
          Reset to default
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <Save size={14} />
          {pending ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-sm text-emerald-600 font-medium">Saved!</span>}
      </div>
    </div>
  );
}
