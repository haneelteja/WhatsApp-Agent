'use client';

import { useState, useTransition, useMemo } from 'react';
import { Save, RefreshCw, Search, X, Check } from 'lucide-react';
import { saveFollowUpConfigAction, type FollowUpScope } from '@/app/actions/follow-up';

interface Contact {
  id:   string;
  phone: string;
  name:  string | null;
}

interface Props {
  productSlug:      string;
  productName:      string;
  contacts:         Contact[];
  initialEnabled:   boolean;
  initialIdleDays:  number;
  initialTemplate:  string;
  initialMaxSends:  number;
  initialScope:     FollowUpScope;
  initialContactIds: string[];
}

const DEFAULT_TEMPLATE = "Hi {name}! We noticed you haven't been in touch for a while. Is there anything we can help you with today?";

const SCOPE_OPTIONS: { value: FollowUpScope; label: string; desc: string }[] = [
  { value: 'all',     label: 'All conversations',       desc: 'Every idle open conversation gets a follow-up'              },
  { value: 'include', label: 'Selected contacts only',  desc: 'Only the contacts you pick below will be followed up'       },
  { value: 'exclude', label: 'All except selected',     desc: 'Everyone gets a follow-up except the contacts you exclude'  },
];

function ContactPicker({
  contacts,
  selected,
  onChange,
  verb,
}: {
  contacts:  Contact[];
  selected:  Set<string>;
  onChange:  (next: Set<string>) => void;
  verb:      string;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? contacts.filter(c => (c.name ?? '').toLowerCase().includes(q) || c.phone.includes(q))
      : contacts;
  }, [contacts, search]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  }

  function toggleAll() {
    if (selected.size === contacts.length) onChange(new Set());
    else onChange(new Set(contacts.map(c => c.id)));
  }

  const selectedContacts = contacts.filter(c => selected.has(c.id));

  return (
    <div className="space-y-3">
      {/* Selected chips */}
      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
          {selectedContacts.map(c => (
            <span key={c.id} className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-medium">
              {c.name ?? c.phone}
              <button type="button" onClick={() => toggle(c.id)} title={`Remove ${c.name ?? c.phone}`} className="text-emerald-500 hover:text-emerald-700 ml-0.5">
                <X size={9} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="text-[11px] text-slate-400 hover:text-slate-600 ml-1 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Search + list */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50">
          <Search size={12} className="text-slate-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="flex-1 text-xs bg-transparent focus:outline-none text-slate-700 placeholder-slate-400"
          />
          {contacts.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium shrink-0 transition-colors"
            >
              {selected.size === contacts.length ? 'Deselect all' : 'Select all'}
            </button>
          )}
        </div>

        <div className="max-h-52 overflow-y-auto divide-y divide-slate-50">
          {contacts.length === 0 ? (
            <p className="text-xs text-slate-400 px-4 py-6 text-center">No contacts with conversations yet.</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-slate-400 px-4 py-4 text-center">No matches for &ldquo;{search}&rdquo;</p>
          ) : (
            filtered.map(c => {
              const isSelected = selected.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${isSelected ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                >
                  <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                    {isSelected && <Check size={9} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate">{c.name ?? c.phone}</p>
                    {c.name && <p className="text-[10px] text-slate-400 truncate">{c.phone}</p>}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100">
          <p className="text-[10px] text-slate-400">
            {selected.size} of {contacts.length} contacts {verb}
          </p>
        </div>
      </div>
    </div>
  );
}

export function FollowUpForm({
  productSlug,
  productName,
  contacts,
  initialEnabled,
  initialIdleDays,
  initialTemplate,
  initialMaxSends,
  initialScope,
  initialContactIds,
}: Props) {
  const [pending,    startTransition]  = useTransition();
  const [saved,      setSaved]         = useState(false);
  const [error,      setError]         = useState<string | null>(null);

  const [enabled,    setEnabled]    = useState(initialEnabled);
  const [idleDays,   setIdleDays]   = useState(initialIdleDays);
  const [template,   setTemplate]   = useState(initialTemplate || DEFAULT_TEMPLATE);
  const [maxSends,   setMaxSends]   = useState(initialMaxSends);
  const [scope,      setScope]      = useState<FollowUpScope>(initialScope);
  const [contactIds, setContactIds] = useState<Set<string>>(new Set(initialContactIds));

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await saveFollowUpConfigAction(productSlug, {
        enabled,
        idle_days:        idleDays,
        message_template: template,
        max_follow_ups:   maxSends,
        scope,
        contact_ids:      Array.from(contactIds),
      });
      if ('error' in res && res.error) {
        setError(res.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  const showPicker = scope !== 'all';
  const pickerVerb = scope === 'include' ? 'selected for follow-up' : 'excluded from follow-up';

  return (
    <div className="space-y-5">
      {/* Enable toggle */}
      <div className={`flex items-center justify-between p-4 rounded-xl border ${enabled ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
        <div>
          <p className={`text-sm font-semibold ${enabled ? 'text-emerald-800' : 'text-slate-700'}`}>
            Auto Follow-up
          </p>
          <p className={`text-xs mt-0.5 ${enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
            {enabled
              ? `Bot will follow up idle customers after ${idleDays} day${idleDays !== 1 ? 's' : ''}`
              : 'Enable to automatically re-engage idle customers'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled ? 'true' : 'false'}
          title={enabled ? 'Disable auto follow-up' : 'Enable auto follow-up'}
          onClick={() => setEnabled(v => !v)}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-300 ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Scope selector */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Who gets followed up?
        </label>
        <div className="grid grid-cols-1 gap-2">
          {SCOPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setScope(opt.value)}
              className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                scope === opt.value
                  ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className={`w-4 h-4 mt-0.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${scope === opt.value ? 'border-emerald-500' : 'border-slate-300'}`}>
                {scope === opt.value && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
              </div>
              <div>
                <p className={`text-sm font-semibold ${scope === opt.value ? 'text-emerald-800' : 'text-slate-700'}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Contact picker — shown for include/exclude */}
      {showPicker && (
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {scope === 'include' ? 'Select contacts to include' : 'Select contacts to exclude'}
          </label>
          <ContactPicker
            contacts={contacts}
            selected={contactIds}
            onChange={setContactIds}
            verb={pickerVerb}
          />
          {contactIds.size === 0 && (
            <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {scope === 'include'
                ? 'No contacts selected — no follow-ups will be sent until you select at least one.'
                : 'No contacts excluded — all idle conversations will be followed up (same as "All").'}
            </p>
          )}
        </div>
      )}

      {/* Idle days + max follow-ups */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Idle Days</label>
          <p className="text-xs text-gray-400">Follow up after this many days of silence</p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              aria-label="Idle days before follow-up"
              title="Idle days before follow-up"
              min={1}
              max={30}
              value={idleDays}
              onChange={e => setIdleDays(Number(e.target.value))}
              className="flex-1 accent-emerald-500"
            />
            <span className="text-sm font-mono font-semibold text-gray-700 w-8 text-right">{idleDays}d</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Max Follow-ups</label>
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
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Follow-up Message</label>
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
