'use client';

import { useState, useTransition } from 'react';
import { Bot, ChevronDown, ChevronUp, Save, Check, Loader2 } from 'lucide-react';
import { saveBotPersonaAction, type BotPersona } from '@/app/actions/bot-persona';

const BOT_META: Record<string, { label: string; color: string; bg: string }> = {
  support_bot:   { label: 'Support Bot',   color: 'text-sky-700',    bg: 'bg-sky-50'    },
  sales_bot:     { label: 'Sales Bot',     color: 'text-violet-700', bg: 'bg-violet-50' },
  lifecycle_bot: { label: 'Lifecycle Bot', color: 'text-orange-700', bg: 'bg-orange-50' },
};

interface PersonaPanelProps {
  productSlug: string;
  initial:     BotPersona | null;
}

function PersonaPanel({ productSlug, initial }: PersonaPanelProps) {
  const meta = BOT_META[productSlug] ?? { label: productSlug, color: 'text-gray-700', bg: 'bg-gray-50' };

  const [open, setOpen]   = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start]  = useTransition();

  const [form, setForm] = useState({
    persona_name:         initial?.persona_name         ?? '',
    persona_role:         initial?.persona_role         ?? '',
    company_description:  initial?.company_description  ?? '',
    company_values:       initial?.company_values        ?? '',
    conversation_purpose: initial?.conversation_purpose ?? '',
  });

  function field(key: keyof typeof form) {
    return {
      value:    form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(prev => ({ ...prev, [key]: e.target.value })),
    };
  }

  function handleSave() {
    setError(null);
    start(async () => {
      const res = await saveBotPersonaAction(productSlug, {
        persona_name:         form.persona_name         || null,
        persona_role:         form.persona_role         || null,
        company_description:  form.company_description  || null,
        company_values:       form.company_values        || null,
        conversation_purpose: form.conversation_purpose || null,
      });
      if (res.error) { setError(res.error); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  const hasData = Object.values(form).some(v => v.trim());

  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${meta.bg} ${meta.color}`}>
            <Bot size={11} />
            {meta.label}
          </span>
          {hasData && (
            <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full font-medium">Persona set</span>
          )}
        </div>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-50">
          <p className="text-xs text-gray-400 pt-3">
            These fields inject a structured identity preamble before the system prompt. All fields are optional — the bot works without them.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Bot Name</label>
              <input
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-gray-300"
                placeholder="e.g. Aria"
                {...field('persona_name')}
              />
              <p className="text-[10px] text-gray-400 mt-1">Becomes &ldquo;You are Aria, …&rdquo; in the prompt</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role / Title</label>
              <input
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-gray-300"
                placeholder="e.g. Customer Success Specialist at Acme"
                {...field('persona_role')}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Company Description</label>
            <textarea
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none placeholder:text-gray-300"
              placeholder="e.g. Acme Corp is a B2B SaaS platform helping logistics companies automate dispatch."
              {...field('company_description')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Company Values / Tone</label>
            <textarea
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none placeholder:text-gray-300"
              placeholder="e.g. Be concise, transparent, and customer-first. Never over-promise."
              {...field('company_values')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Conversation Purpose</label>
            <textarea
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none placeholder:text-gray-300"
              placeholder="e.g. Help customers resolve billing issues quickly and escalate to a human when the issue is complex."
              {...field('conversation_purpose')}
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
              {saved ? 'Saved!' : 'Save Persona'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface PersonaEditorProps {
  activeSlugs: string[];
  personas:    BotPersona[];
}

export function PersonaEditor({ activeSlugs, personas }: PersonaEditorProps) {
  const bySlug: Record<string, BotPersona> = {};
  for (const p of personas) bySlug[p.product_slug] = p;

  return (
    <div className="space-y-2">
      {activeSlugs.map(slug => (
        <PersonaPanel key={slug} productSlug={slug} initial={bySlug[slug] ?? null} />
      ))}
    </div>
  );
}
