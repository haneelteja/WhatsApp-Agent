import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { ShieldCheck } from 'lucide-react';
import { BotTypeGuardrailsForm } from '@/components/platform/BotTypeGuardrailsForm';
import type { LayeredGuardrailsConfig } from '@alphabot/shared';

const BOT_TYPES = [
  {
    slug:  'support_bot',
    name:  'Support Bot',
    desc:  'Q&A, issue resolution, escalations',
    bg:    'bg-sky-50',
    border: 'border-sky-200',
    badge:  'bg-sky-100 text-sky-700',
  },
  {
    slug:  'sales_bot',
    name:  'Sales Bot',
    desc:  'Lead qualification & warm handoff',
    bg:    'bg-violet-50',
    border: 'border-violet-200',
    badge:  'bg-violet-100 text-violet-700',
  },
  {
    slug:  'lifecycle_bot',
    name:  'Lifecycle Bot',
    desc:  'Orders, invoicing, payments',
    bg:    'bg-orange-50',
    border: 'border-orange-200',
    badge:  'bg-orange-100 text-orange-700',
  },
];

const DEFAULT_GUARDRAILS: LayeredGuardrailsConfig = {
  blocked_topics:      [],
  blocked_keywords:    [],
  max_response_length: 2000,
  kb_only_mode:        false,
  no_personal_data:    false,
  no_external_links:   false,
  on_blocked_topic:    'escalate',
};

export default async function BotGuardrailsPage() {
  const admin = getSupabaseAdminClient();

  const { data: rows } = await admin
    .from('bot_type_guardrails')
    .select('product_slug, guardrails_json');

  const rowMap: Record<string, LayeredGuardrailsConfig> = {};
  for (const r of rows ?? []) {
    rowMap[r.product_slug] = r.guardrails_json as LayeredGuardrailsConfig;
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Bot-Type Guardrails</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Platform-wide rules per bot type — applied to every client using that bot, regardless of their own settings.
        </p>
      </div>

      {/* Layer explanation */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-700 space-y-1">
        <p className="font-semibold text-indigo-800">4-Layer guardrails hierarchy</p>
        <ol className="list-decimal ml-4 space-y-0.5 text-indigo-600">
          <li><span className="font-medium">Global</span> — Platform Settings → applies to every bot on the whole platform</li>
          <li><span className="font-medium">Bot-type</span> — this page → applies to all clients using that bot type <span className="italic">(you are here)</span></li>
          <li><span className="font-medium">Client-wide</span> — Client detail page → applies across all bots for one client</li>
          <li><span className="font-medium">Client-bot</span> — Client&apos;s Settings → per-bot fine-tuning</li>
        </ol>
        <p className="text-indigo-500 mt-1">Blocked topics & keywords are <span className="font-medium">unioned</span> across all layers. Max length takes the <span className="font-medium">minimum</span>. KB-only is an <span className="font-medium">OR</span> (any layer can enable it).</p>
      </div>

      {BOT_TYPES.map(bt => (
        <div key={bt.slug} className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden`}>
          <div className={`flex items-center gap-2.5 px-5 py-4 border-b border-slate-50 ${bt.bg}`}>
            <ShieldCheck size={16} className="text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-800">{bt.name}</h3>
            <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${bt.badge}`}>
              {bt.desc}
            </span>
          </div>
          <div className="px-5 py-5">
            <BotTypeGuardrailsForm
              productSlug={bt.slug}
              initial={rowMap[bt.slug] ?? DEFAULT_GUARDRAILS}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
