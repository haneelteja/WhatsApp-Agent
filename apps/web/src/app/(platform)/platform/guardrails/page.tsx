import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { Globe, ShieldCheck } from 'lucide-react';
import { PlatformGuardrailsForm } from '@/components/platform/PlatformGuardrailsForm';
import { BotTypeGuardrailsForm } from '@/components/platform/BotTypeGuardrailsForm';
import { CollapsibleCard } from '@/components/CollapsibleCard';
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

// Palette cycles for dynamically-added products
const BADGE_PALETTE = [
  'bg-sky-100 text-sky-700 border-sky-200',
  'bg-violet-100 text-violet-700 border-violet-200',
  'bg-orange-100 text-orange-700 border-orange-200',
  'bg-teal-100 text-teal-700 border-teal-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-pink-100 text-pink-700 border-pink-200',
];

function SummaryPill({ count, singular }: { count: number; singular: string }) {
  const label = `${count} ${singular}${count !== 1 ? 's' : ''}`;
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${count > 0 ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200' : 'bg-slate-100 text-slate-400'}`}>
      {label}
    </span>
  );
}

export default async function PlatformGuardrailsPage() {
  const admin = getSupabaseAdminClient();

  const [{ data: settingsRow }, { data: botTypeRows }, { data: products }] = await Promise.all([
    admin.from('platform_settings').select('value').eq('key', 'guardrails').single(),
    admin.from('bot_type_guardrails').select('product_slug, guardrails_json'),
    admin.from('products').select('slug, name, description, active').order('slug'),
  ]);

  const globalGuardrails = (settingsRow?.value as PlatformGuardrails) ?? DEFAULT_GLOBAL;
  const botTypeMap: Record<string, LayeredGuardrailsConfig> = {};
  for (const r of botTypeRows ?? []) {
    botTypeMap[r.product_slug] = r.guardrails_json as LayeredGuardrailsConfig;
  }

  // Only show active products
  const activeProducts = (products ?? []).filter(p => p.active);

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">

      {/* Page title */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Guardrails</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Platform-level rules that cascade down to every client and bot.
        </p>
      </div>


      {/* ── Layer 1: Global ──────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Globe size={14} className="text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-800">Layer 1 — Global Rules</h3>
          <span className="ml-auto text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
            Every bot · Every client
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 bg-indigo-50/50 border-b border-indigo-100">
            <p className="text-xs text-indigo-600">
              The outermost layer — these rules apply universally and cannot be overridden by clients or individual bots.
            </p>
          </div>
          <div className="px-5 py-5">
            <PlatformGuardrailsForm initial={globalGuardrails} />
          </div>
        </div>
      </div>

      {/* ── Divider ─────────────────────────────────────────────────────────── */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-3 bg-slate-50 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
            Bot-Type Overrides
          </span>
        </div>
      </div>

      {/* ── Layer 2: Per-bot-type ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={14} className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Layer 2 — Bot-Type Defaults</h3>
          <span className="ml-auto text-[11px] text-slate-400">Applied after global · before per-client</span>
        </div>

        <div className="space-y-3">
          {activeProducts.map((p, idx) => {
            const g = { ...DEFAULT_BOT_TYPE, ...(botTypeMap[p.slug] ?? {}) };
            const topicsCount   = g.blocked_topics.length;
            const keywordsCount = g.blocked_keywords.length;
            const badge = BADGE_PALETTE[idx % BADGE_PALETTE.length]!;

            const header = (
              <div className="flex items-center gap-3 w-full min-w-0">
                <ShieldCheck size={14} className="text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">{p.name}</span>
                    {p.description && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge}`}>
                        {p.description}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <SummaryPill count={topicsCount}   singular="topic"   />
                    <SummaryPill count={keywordsCount} singular="keyword" />
                    {g.kb_only_mode && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium ring-1 ring-amber-200">
                        KB-only on
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );

            return (
              <CollapsibleCard key={p.slug} header={header} defaultOpen={false}>
                <BotTypeGuardrailsForm productSlug={p.slug} initial={g} />
              </CollapsibleCard>
            );
          })}
        </div>

        {activeProducts.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">
            No active products. Add a product on the Products page first.
          </p>
        )}

        {activeProducts.length > 0 && (
          <p className="text-[11px] text-slate-400 mt-3 text-center">
            Click a bot card to expand and configure its defaults. Changes apply to all clients using that bot type.
          </p>
        )}
      </div>
    </div>
  );
}
