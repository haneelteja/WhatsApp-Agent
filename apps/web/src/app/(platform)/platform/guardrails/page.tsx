import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { Globe, ShieldCheck } from 'lucide-react';
import { PlatformGuardrailsForm } from '@/components/platform/PlatformGuardrailsForm';
import { BotTypeGuardrailsForm } from '@/components/platform/BotTypeGuardrailsForm';
import type { LayeredGuardrailsConfig, PlatformGuardrails } from '@alphabot/shared';

const DEFAULT_GLOBAL: PlatformGuardrails = {
  global_blocked_topics:    [],
  global_blocked_keywords:  [],
  max_response_length:      2000,
  enforce_kb_only_globally: false,
  content_filters: { no_personal_data: false, no_external_links: false },
};

const DEFAULT_BOT_TYPE: LayeredGuardrailsConfig = {
  blocked_topics:      [],
  blocked_keywords:    [],
  max_response_length: 2000,
  kb_only_mode:        false,
  no_personal_data:    false,
  no_external_links:   false,
  on_blocked_topic:    'escalate',
};

const BOT_TYPES = [
  { slug: 'support_bot',   name: 'Support Bot',   desc: 'Q&A, issue resolution, escalations',  badge: 'bg-sky-100 text-sky-700 border-sky-200' },
  { slug: 'sales_bot',     name: 'Sales Bot',     desc: 'Lead qualification & warm handoff',   badge: 'bg-violet-100 text-violet-700 border-violet-200' },
  { slug: 'lifecycle_bot', name: 'Lifecycle Bot', desc: 'Orders, invoicing, payments',         badge: 'bg-orange-100 text-orange-700 border-orange-200' },
];

export default async function PlatformGuardrailsPage() {
  const admin = getSupabaseAdminClient();

  const [{ data: settingsRow }, { data: botTypeRows }] = await Promise.all([
    admin.from('platform_settings').select('value').eq('key', 'guardrails').single(),
    admin.from('bot_type_guardrails').select('product_slug, guardrails_json'),
  ]);

  const globalGuardrails = (settingsRow?.value as PlatformGuardrails) ?? DEFAULT_GLOBAL;
  const botTypeMap: Record<string, LayeredGuardrailsConfig> = {};
  for (const r of botTypeRows ?? []) {
    botTypeMap[r.product_slug] = r.guardrails_json as LayeredGuardrailsConfig;
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Guardrails</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Platform-level rules that cascade down to every client and bot.
        </p>
      </div>

      {/* Cascade explanation */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-700 space-y-1">
        <p className="font-semibold text-indigo-800">4-Layer cascade — platform controls Layers 1 & 2</p>
        <ol className="list-decimal ml-4 space-y-0.5 text-indigo-600">
          <li><span className="font-semibold">Layer 1 — Global</span> — applies to every bot on the whole platform <span className="italic">(below)</span></li>
          <li><span className="font-semibold">Layer 2 — Bot-type</span> — applies to all clients using that bot type <span className="italic">(below)</span></li>
          <li className="text-indigo-400">Layer 3 — Client-wide — set per client in their detail page or by the client in their Guardrails tab</li>
          <li className="text-indigo-400">Layer 4 — Per-bot — set by each client in their Guardrails tab</li>
        </ol>
        <p className="text-indigo-500 mt-1">
          Keywords &amp; topics are <span className="font-semibold">unioned</span>. Max length takes the <span className="font-semibold">minimum</span>. KB-only is an <span className="font-semibold">OR</span>.
        </p>
      </div>

      {/* ── Layer 1: Global ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-50 bg-indigo-50/40">
          <Globe size={16} className="text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-800">Layer 1 — Global Rules</h3>
          <span className="ml-auto text-[11px] px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-semibold border border-indigo-200">
            Every bot · Every client
          </span>
        </div>
        <div className="px-5 py-5">
          <p className="text-xs text-gray-400 mb-5">
            These rules are the outermost layer and cannot be overridden by clients.
          </p>
          <PlatformGuardrailsForm initial={globalGuardrails} />
        </div>
      </div>

      {/* ── Layer 2: Per-bot-type ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={15} className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Layer 2 — Bot-Type Defaults</h3>
          <span className="ml-auto text-[11px] text-slate-400">Applied after global, before per-client</span>
        </div>

        <div className="space-y-4">
          {BOT_TYPES.map(bt => (
            <div key={bt.slug} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-50">
                <ShieldCheck size={15} className="text-slate-400" />
                <h4 className="text-sm font-semibold text-slate-800">{bt.name}</h4>
                <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${bt.badge}`}>
                  {bt.desc}
                </span>
              </div>
              <div className="px-5 py-5">
                <BotTypeGuardrailsForm
                  productSlug={bt.slug}
                  initial={botTypeMap[bt.slug] ?? DEFAULT_BOT_TYPE}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
