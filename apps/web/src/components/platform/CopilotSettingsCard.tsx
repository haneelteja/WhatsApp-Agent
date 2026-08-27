'use client';

import { useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { saveCopilotConfigAction, type CopilotConfig } from '@/app/actions/copilot-settings';

const ACTION_LABELS: Record<string, { label: string; desc: string }> = {
  add_kb_article:             { label: 'Add KB articles',             desc: 'Copilot can add FAQ entries to any collection' },
  update_escalation_triggers: { label: 'Update escalation triggers',  desc: 'Copilot can change keywords that escalate to agents' },
  toggle_button_template:     { label: 'Enable/disable button templates', desc: 'Copilot can activate or deactivate WhatsApp button menus' },
  update_system_prompt:       { label: 'Edit system prompt',          desc: 'Copilot can rewrite the bot personality instructions' },
};

export function CopilotSettingsCard({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: CopilotConfig;
}) {
  const [cfg, setCfg] = useState<CopilotConfig>(initial);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggleAction = (key: string) => {
    setCfg(prev => ({
      ...prev,
      allowed_actions: prev.allowed_actions.includes(key)
        ? prev.allowed_actions.filter(a => a !== key)
        : [...prev.allowed_actions, key],
    }));
    setSaved(false);
  };

  const save = () => {
    startTransition(async () => {
      await saveCopilotConfigAction(tenantId, cfg);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  };

  return (
    <div className="space-y-5">
      {/* Enable / Disable */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-800">Enable AI Copilot</p>
          <p className="text-xs text-slate-400 mt-0.5">When disabled, the ✨ chat bubble is hidden for all users of this tenant</p>
        </div>
        <button
          onClick={() => { setCfg(prev => ({ ...prev, enabled: !prev.enabled })); setSaved(false); }}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${cfg.enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${cfg.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Custom instructions */}
      <div>
        <label className="block text-sm font-medium text-slate-800 mb-1.5">
          Custom instructions
          <span className="text-slate-400 font-normal ml-1.5">(injected into Copilot system prompt)</span>
        </label>
        <textarea
          value={cfg.instructions}
          onChange={e => { setCfg(prev => ({ ...prev, instructions: e.target.value })); setSaved(false); }}
          rows={4}
          placeholder="e.g. Always respond in Hindi. Refer to the bot as 'Elma'. Never discuss competitor products."
          className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none"
        />
        <p className="text-[11px] text-slate-400 mt-1">These instructions are appended to the copilot&apos;s context on every request.</p>
      </div>

      {/* Allowed actions */}
      <div>
        <p className="text-sm font-medium text-slate-800 mb-2">Allowed write actions</p>
        <p className="text-xs text-slate-400 mb-3">
          Unchecked actions will not be available to the Copilot — users won&apos;t be prompted for approval on those.
        </p>
        <div className="space-y-2">
          {Object.entries(ACTION_LABELS).map(([key, { label, desc }]) => (
            <label key={key} className="flex items-start gap-3 cursor-pointer group">
              <div className="flex-shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={cfg.allowed_actions.includes(key)}
                  onChange={() => toggleAction(key)}
                  className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                />
              </div>
              <div>
                <p className="text-sm text-slate-700 font-medium group-hover:text-slate-900">{label}</p>
                <p className="text-xs text-slate-400">{desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={save}
          disabled={pending}
          className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-sm text-emerald-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}
