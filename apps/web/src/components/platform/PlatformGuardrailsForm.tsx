'use client';

import { useState, useTransition } from 'react';
import { Save } from 'lucide-react';
import { savePlatformGuardrailsAction } from '@/app/actions/platform-settings';
import type { PlatformGuardrails } from '@alphabot/shared';

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

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 text-sm bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 font-medium"
        >
          Add
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="text-slate-400 hover:text-slate-700 leading-none"
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

export function PlatformGuardrailsForm({ initial }: { initial: PlatformGuardrails }) {
  const [pending, startTransition] = useTransition();
  const [saved,   setSaved]        = useState(false);
  const [error,   setError]        = useState<string | null>(null);

  const [blockedTopics,    setBlockedTopics]    = useState<string[]>(initial.global_blocked_topics ?? []);
  const [blockedKeywords,  setBlockedKeywords]  = useState<string[]>(initial.global_blocked_keywords ?? []);
  const [maxLength,        setMaxLength]        = useState(initial.max_response_length ?? 2000);
  const [kbOnlyGlobal,     setKbOnlyGlobal]     = useState(initial.enforce_kb_only_globally ?? false);
  const [noPersonalData,   setNoPersonalData]   = useState(initial.content_filters?.no_personal_data ?? false);
  const [noExternalLinks,  setNoExternalLinks]  = useState(initial.content_filters?.no_external_links ?? false);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await savePlatformGuardrailsAction({
        global_blocked_topics:    blockedTopics,
        global_blocked_keywords:  blockedKeywords,
        max_response_length:      maxLength,
        enforce_kb_only_globally: kbOnlyGlobal,
        content_filters: {
          no_personal_data:  noPersonalData,
          no_external_links: noExternalLinks,
        },
      });
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Enforce KB-only globally */}
      <div className="flex items-start justify-between gap-4 p-4 bg-amber-50 rounded-xl border border-amber-100">
        <div>
          <p className="text-sm font-semibold text-amber-800">Enforce KB-Only Mode Globally</p>
          <p className="text-xs text-amber-600 mt-0.5">
            Forces all bots to only answer from their knowledge base. Overrides per-tenant setting.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setKbOnlyGlobal((v) => !v)}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${kbOnlyGlobal ? 'bg-amber-500' : 'bg-gray-200'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${kbOnlyGlobal ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      {/* Global blocked topics */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Global Blocked Topics
        </label>
        <p className="text-xs text-gray-400">All bots will refuse to discuss these topics regardless of client settings.</p>
        <TagInput value={blockedTopics} onChange={setBlockedTopics} placeholder="e.g. politics" />
      </div>

      {/* Global blocked keywords */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Global Blocked Keywords
        </label>
        <p className="text-xs text-gray-400">Messages containing these keywords are blocked before reaching any AI model.</p>
        <TagInput value={blockedKeywords} onChange={setBlockedKeywords} placeholder="e.g. inappropriate word" />
      </div>

      {/* Max response length */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Max Response Length (characters)
        </label>
        <p className="text-xs text-gray-400">Platform-wide ceiling. Per-tenant limits cannot exceed this value.</p>
        <input
          type="number"
          min={200}
          max={8000}
          value={maxLength}
          onChange={(e) => setMaxLength(parseInt(e.target.value, 10))}
          className="w-40 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      {/* Content filters */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Global Content Filters</label>
        {[
          { label: 'No personal data in any response',  value: noPersonalData,  set: setNoPersonalData  },
          { label: 'No external links in any response', value: noExternalLinks, set: setNoExternalLinks },
        ].map(({ label, value, set }) => (
          <label key={label} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => set(e.target.checked)}
              className="w-4 h-4 accent-indigo-500"
            />
            <span className="text-sm text-gray-700">{label}</span>
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Save size={14} />
          {pending ? 'Saving…' : 'Save Platform Guardrails'}
        </button>
        {saved && <span className="text-sm text-indigo-600 font-medium">Saved!</span>}
      </div>
    </div>
  );
}
