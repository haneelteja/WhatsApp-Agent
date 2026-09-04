'use client';

import { useState, useTransition } from 'react';
import { Bot, ChevronDown, ChevronUp, Save, Check, Loader2, Wrench, AlertCircle } from 'lucide-react';
import { saveBotToolsAction } from '@/app/actions/bot-tools';

// Must mirror TOOL_DEFINITIONS in apps/api/src/lib/tool-registry.ts
const ALL_TOOLS = [
  {
    id:          'knowledge_base',
    label:       'Knowledge Base Lookup',
    description: 'AI searches your knowledge base before responding. Enables accurate, cited answers.',
    botTypes:    ['support_bot', 'sales_bot', 'lifecycle_bot'],
    default:     true,
  },
  {
    id:          'product_catalogue',
    label:       'Product Catalogue',
    description: 'AI can display and quote from your product/price catalogue.',
    botTypes:    ['sales_bot', 'lifecycle_bot'],
    default:     true,
  },
  {
    id:          'button_templates',
    label:       'Interactive Buttons',
    description: 'AI sends WhatsApp button messages for structured choices.',
    botTypes:    ['support_bot', 'sales_bot', 'lifecycle_bot'],
    default:     true,
  },
  {
    id:          'lead_scoring',
    label:       'Lead Scoring',
    description: 'AI detects buying intent and flags high-value leads for human follow-up.',
    botTypes:    ['sales_bot'],
    default:     true,
  },
  {
    id:          'intent_signals',
    label:       'Intent Signal Detection',
    description: 'AI tags conversations with signals (pricing inquiry, urgency, objections) for explainable scoring.',
    botTypes:    ['sales_bot', 'lifecycle_bot'],
    default:     true,
  },
  {
    id:          'contact_memory',
    label:       'Contact Memory',
    description: 'AI remembers previous interactions and preferences for returning contacts.',
    botTypes:    ['support_bot', 'sales_bot', 'lifecycle_bot'],
    default:     true,
  },
  {
    id:          'scheduled_followup',
    label:       'Scheduled Follow-up',
    description: 'AI can schedule automatic follow-up messages when conversations go quiet.',
    botTypes:    ['sales_bot', 'lifecycle_bot'],
    default:     false,
  },
  {
    id:          'voice_escalation',
    label:       'Voice Call Escalation',
    description: 'AI can trigger an outbound voice call when a high-intent lead is detected.',
    botTypes:    ['sales_bot'],
    default:     false,
  },
];

const BOT_META: Record<string, { label: string; color: string; bg: string }> = {
  support_bot:   { label: 'Support Bot',   color: 'text-sky-700',    bg: 'bg-sky-50'    },
  sales_bot:     { label: 'Sales Bot',     color: 'text-violet-700', bg: 'bg-violet-50' },
  lifecycle_bot: { label: 'Lifecycle Bot', color: 'text-orange-700', bg: 'bg-orange-50' },
};

function defaultTools(productSlug: string): string[] {
  return ALL_TOOLS
    .filter(t => t.default && t.botTypes.includes(productSlug))
    .map(t => t.id);
}

interface ToolPanelProps {
  productSlug:  string;
  initialTools: string[];
}

function ToolPanel({ productSlug, initialTools }: ToolPanelProps) {
  const meta = BOT_META[productSlug] ?? { label: productSlug, color: 'text-gray-700', bg: 'bg-gray-50' };
  const relevantTools = ALL_TOOLS.filter(t => t.botTypes.includes(productSlug));

  const [open, setOpen]     = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [pending, start]    = useTransition();
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(initialTools.length > 0 ? initialTools : defaultTools(productSlug))
  );

  function toggle(toolId: string) {
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId); else next.add(toolId);
      return next;
    });
  }

  function handleSave() {
    setError(null);
    start(async () => {
      const res = await saveBotToolsAction(productSlug, [...enabled]);
      if (res.error) { setError(res.error); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  const activeCount = relevantTools.filter(t => enabled.has(t.id)).length;

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
          <span className="text-[10px] text-gray-400">{activeCount}/{relevantTools.length} tools active</span>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-gray-50">
          <p className="text-xs text-gray-400 pt-3">
            Toggle capabilities for this bot. Disabled tools are not called and their prompt instructions are not injected — reducing token usage and controlling behaviour.
          </p>

          <div className="space-y-2">
            {relevantTools.map(tool => {
              const isOn = enabled.has(tool.id);
              return (
                <label key={tool.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  isOn ? 'bg-emerald-50/60 border-emerald-200' : 'bg-gray-50/50 border-gray-100 opacity-60'
                }`}>
                  <div className="relative mt-0.5 shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={isOn}
                      onChange={() => toggle(tool.id)}
                    />
                    <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                      isOn ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 bg-white'
                    }`}>
                      {isOn && <Check size={10} className="text-white" strokeWidth={3} />}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-gray-800">{tool.label}</p>
                      {!tool.default && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Advanced</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">{tool.description}</p>
                  </div>
                </label>
              );
            })}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertCircle size={12} /> {error}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Wrench size={14} />}
              {saved ? 'Saved!' : 'Save Tools'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ToolManifestEditorProps {
  activeSlugs:  string[];
  botToolsRows: { product_slug: string; allowed_tools: string[] }[];
}

export function ToolManifestEditor({ activeSlugs, botToolsRows }: ToolManifestEditorProps) {
  const bySlug: Record<string, string[]> = {};
  for (const r of botToolsRows) bySlug[r.product_slug] = r.allowed_tools;

  return (
    <div className="space-y-2">
      {activeSlugs.map(slug => (
        <ToolPanel key={slug} productSlug={slug} initialTools={bySlug[slug] ?? []} />
      ))}
    </div>
  );
}
