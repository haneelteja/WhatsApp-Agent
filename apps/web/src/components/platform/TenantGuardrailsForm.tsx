'use client';

import { useState, useTransition } from 'react';
import { Save } from 'lucide-react';
import type { LayeredGuardrailsConfig } from '@alphabot/shared';

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
    const t = input.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput('');
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300"
        />
        <button type="button" onClick={add} className="px-3 py-2 text-sm bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 font-medium">
          Add
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">
              {tag}
              <button type="button" onClick={() => onChange(value.filter(t => t !== tag))} className="text-slate-400 hover:text-slate-700 leading-none">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const DEFAULTS: LayeredGuardrailsConfig = {
  blocked_topics: [],
  blocked_keywords: [],
  max_response_length: 2000,
  kb_only_mode: false,
  no_personal_data: false,
  no_external_links: false,
  on_blocked_topic: 'escalate',
};

type SaveAction = (data: LayeredGuardrailsConfig) => Promise<{ error?: string } | { success: boolean }>;

export function TenantGuardrailsForm({
  initial,
  action,
  accentColor = 'emerald',
}: {
  initial: LayeredGuardrailsConfig;
  action: SaveAction;
  accentColor?: 'emerald' | 'indigo';
}) {
  const g = { ...DEFAULTS, ...initial };

  const [pending, startTransition] = useTransition();
  const [saved,   setSaved]        = useState(false);
  const [error,   setError]        = useState<string | null>(null);

  const [blockedTopics,   setBlockedTopics]   = useState<string[]>(g.blocked_topics);
  const [blockedKeywords, setBlockedKeywords] = useState<string[]>(g.blocked_keywords);
  const [maxLength,       setMaxLength]       = useState(g.max_response_length);
  const [kbOnly,          setKbOnly]          = useState(g.kb_only_mode);
  const [noPersonalData,  setNoPersonalData]  = useState(g.no_personal_data);
  const [noExternalLinks, setNoExternalLinks] = useState(g.no_external_links);
  const [onBlocked,       setOnBlocked]       = useState<LayeredGuardrailsConfig['on_blocked_topic']>(g.on_blocked_topic);
  const [customMsg,       setCustomMsg]       = useState(g.custom_blocked_message ?? '');

  const ring  = accentColor === 'emerald' ? 'focus:ring-emerald-300' : 'focus:ring-indigo-300';
  const btnBg = accentColor === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700';
  const savedColor = accentColor === 'emerald' ? 'text-emerald-600' : 'text-indigo-600';

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await action({
        blocked_topics:         blockedTopics,
        blocked_keywords:       blockedKeywords,
        max_response_length:    maxLength,
        kb_only_mode:           kbOnly,
        no_personal_data:       noPersonalData,
        no_external_links:      noExternalLinks,
        on_blocked_topic:       onBlocked,
        custom_blocked_message: customMsg || undefined,
      });
      if ('error' in result && result.error) setError(result.error);
      else { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    });
  }

  return (
    <div className="space-y-5">
      {/* KB-only across all bots */}
      <div className="flex items-start justify-between gap-4 p-4 bg-amber-50 rounded-xl border border-amber-100">
        <div>
          <p className="text-sm font-semibold text-amber-800">KB-Only Mode (All Bots)</p>
          <p className="text-xs text-amber-600 mt-0.5">Force every bot for this client to only answer from its knowledge base.</p>
        </div>
        <button type="button" onClick={() => setKbOnly(v => !v)}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${kbOnly ? 'bg-amber-500' : 'bg-gray-200'}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${kbOnly ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      {/* Blocked topics */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Blocked Topics</label>
        <p className="text-xs text-gray-400">Applied across all this client's bots — none of them will discuss these topics.</p>
        <TagInput value={blockedTopics} onChange={setBlockedTopics} placeholder="e.g. refund policy" />
      </div>

      {/* Blocked keywords */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Blocked Keywords</label>
        <p className="text-xs text-gray-400">Messages containing these words are blocked before any AI call across all bots.</p>
        <TagInput value={blockedKeywords} onChange={setBlockedKeywords} placeholder="e.g. competitor name" />
      </div>

      {/* Max length */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Max Response Length (chars)</label>
        <input type="number" min={100} max={4000} value={maxLength}
          onChange={e => setMaxLength(parseInt(e.target.value, 10))}
          className={`w-40 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 ${ring}`}
        />
      </div>

      {/* Content filters */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Content Filters</label>
        {[
          { label: 'No personal data in responses', value: noPersonalData,  set: setNoPersonalData  },
          { label: 'No external links in responses', value: noExternalLinks, set: setNoExternalLinks },
        ].map(({ label, value, set }) => (
          <label key={label} className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={value} onChange={e => set(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
            <span className="text-sm text-gray-700">{label}</span>
          </label>
        ))}
      </div>

      {/* On blocked */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">When Blocked Keyword Detected</label>
        <select value={onBlocked} onChange={e => setOnBlocked(e.target.value as LayeredGuardrailsConfig['on_blocked_topic'])}
          className={`text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 ${ring}`}>
          <option value="escalate">Escalate to human agent</option>
          <option value="ignore">Send custom message and stop</option>
        </select>
      </div>

      {onBlocked === 'ignore' && (
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Custom Blocked Message</label>
          <input type="text" value={customMsg} onChange={e => setCustomMsg(e.target.value)}
            placeholder="I'm sorry, I can't help with that topic."
            className={`w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 ${ring}`}
          />
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={handleSave} disabled={pending}
          className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors ${btnBg}`}>
          <Save size={14} />
          {pending ? 'Saving…' : 'Save Guardrails'}
        </button>
        {saved && <span className={`text-sm font-medium ${savedColor}`}>Saved!</span>}
      </div>
    </div>
  );
}
