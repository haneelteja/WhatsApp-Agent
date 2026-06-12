import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { LlmConfigCard } from '@/components/LlmConfigCard';
import { Cpu, ChevronRight } from 'lucide-react';
import type { LlmConfigCardProps } from '@/components/LlmConfigCard';

type RawConfig = {
  id: string;
  provider: string;
  api_key: string;
  model: string;
  base_url: string | null;
  validation_status: 'pending' | 'valid' | 'invalid';
  validation_error: string | null;
  validated_at: string | null;
  credit_info: { usage: number | null; limit: number | null; is_free_tier: boolean } | null;
  created_at: string;
};

function maskConfig(row: RawConfig): LlmConfigCardProps['initial'] {
  return {
    id:                row.id,
    provider:          row.provider,
    api_key_masked:    '••••' + row.api_key.slice(-4),
    model:             row.model,
    base_url:          row.base_url,
    validation_status: row.validation_status,
    validation_error:  row.validation_error,
    validated_at:      row.validated_at,
    credit_info:       row.credit_info,
    created_at:        row.created_at,
  };
}

const BOT_TYPES = [
  { slug: 'support_bot',   name: 'Support Bot',   desc: 'Q&A, issue resolution, escalations',  badge: 'bg-sky-100 text-sky-700 border-sky-200' },
  { slug: 'sales_bot',     name: 'Sales Bot',     desc: 'Lead qualification & warm handoff',   badge: 'bg-violet-100 text-violet-700 border-violet-200' },
  { slug: 'lifecycle_bot', name: 'Lifecycle Bot', desc: 'Orders, invoicing, payments',         badge: 'bg-orange-100 text-orange-700 border-orange-200' },
];

export default async function PlatformAiModelsPage() {
  const admin = getSupabaseAdminClient();

  const { data: rows } = await admin
    .from('llm_configs')
    .select('id, tenant_id, product_slug, provider, api_key, model, base_url, validation_status, validation_error, validated_at, credit_info, created_at')
    .is('tenant_id', null);

  const configMap: Record<string, RawConfig | null> = {
    '__generic__': null,
    support_bot:   null,
    sales_bot:     null,
    lifecycle_bot: null,
  };

  for (const row of (rows ?? []) as unknown as (RawConfig & { product_slug: string | null })[]) {
    const key = row.product_slug ?? '__generic__';
    configMap[key] = row;
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">AI Models</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Configure API keys and models at the platform level.
        </p>
      </div>

      {/* Hierarchy explanation */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-2">
        <p className="text-xs font-semibold text-indigo-800">4-level resolution — most specific valid key wins</p>
        <div className="flex items-center gap-1 flex-wrap text-[11px] text-indigo-600">
          {['Client Bot', 'Client Generic', 'Platform Bot-type', 'Platform Default'].map((level, i) => (
            <span key={level} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={10} className="text-indigo-300" />}
              <span className={i < 2 ? 'text-indigo-400' : 'font-semibold text-indigo-700'}>{level}</span>
            </span>
          ))}
          <span className="ml-1 text-indigo-400">→ env vars</span>
        </div>
        <p className="text-[11px] text-indigo-500">
          Platform configs below are fallbacks — they only apply when no valid client-level config exists. All fields are <span className="font-semibold">optional</span>.
        </p>
      </div>

      {/* ── Platform Default (Level 4 fallback) ─────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100 bg-indigo-50/40">
          <Cpu size={15} className="text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-800">Platform Default</h3>
          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
            Ultimate fallback · All bots · All clients
          </span>
        </div>
        <div className="p-4">
          <LlmConfigCard
            label="Platform Default"
            description="Used when no other level has a valid API key configured."
            tenantId={null}
            productSlug={null}
            initial={configMap['__generic__'] ? maskConfig(configMap['__generic__']!) : null}
            accent="indigo"
          />
        </div>
      </div>

      {/* ── Platform Bot-type Defaults (Level 3 fallback) ───────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Cpu size={14} className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Bot-Type Defaults</h3>
          <span className="ml-auto text-[11px] text-slate-400">Override per bot type · applies before platform default</span>
        </div>
        <div className="space-y-3">
          {BOT_TYPES.map(bt => (
            <div key={bt.slug} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
                <h4 className="text-sm font-semibold text-slate-800">{bt.name}</h4>
                <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${bt.badge}`}>
                  {bt.desc}
                </span>
              </div>
              <div className="p-4">
                <LlmConfigCard
                  label={bt.name}
                  description={`Applies to every client's ${bt.name.toLowerCase()} when they have no client-level config.`}
                  tenantId={null}
                  productSlug={bt.slug}
                  initial={configMap[bt.slug] ? maskConfig(configMap[bt.slug]!) : null}
                  accent="indigo"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
