import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { LlmConfigCard } from '@/components/LlmConfigCard';
import type { LlmConfigCardProps } from '@/components/LlmConfigCard';
import { Cpu, ChevronRight, Info } from 'lucide-react';

type RawConfig = {
  id: string;
  product_slug: string | null;
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

const BOT_META: Record<string, { name: string; badge: string }> = {
  support_bot:   { name: 'Support Bot',   badge: 'bg-sky-100 text-sky-700 border-sky-200'       },
  sales_bot:     { name: 'Sales Bot',     badge: 'bg-violet-100 text-violet-700 border-violet-200' },
  lifecycle_bot: { name: 'Lifecycle Bot', badge: 'bg-orange-100 text-orange-700 border-orange-200' },
};

export default async function AiModelsPage() {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? '';

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', userId)
    .single();

  const tenantId = tenantUser?.tenant_id ?? '';

  const [{ data: llmRows }, { data: products }] = await Promise.all([
    admin
      .from('llm_configs')
      .select('id, product_slug, provider, api_key, model, base_url, validation_status, validation_error, validated_at, credit_info, created_at')
      .eq('tenant_id', tenantId),
    admin
      .from('tenant_products')
      .select('product_type')
      .eq('tenant_id', tenantId)
      .eq('active', true),
  ]);

  const configMap: Record<string, RawConfig | null> = { __generic__: null };
  for (const row of (llmRows ?? []) as RawConfig[]) {
    configMap[row.product_slug ?? '__generic__'] = row;
  }

  const activeSlugs = (products ?? []).map((p: { product_type: string }) => p.product_type);

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">AI Models</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Configure your own API key and model to use for your bots.
        </p>
      </div>

      {/* Hierarchy info */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Info size={13} className="text-emerald-600" />
          <p className="text-xs font-semibold text-emerald-800">How this works</p>
        </div>
        <div className="flex items-center gap-1 flex-wrap text-[11px] text-emerald-600">
          {['Per-Bot (below)', 'Account Default (below)', 'Platform Bot-type', 'Platform Default'].map((level, i) => (
            <span key={level} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={10} className="text-emerald-300" />}
              <span className={i < 2 ? 'font-semibold text-emerald-700' : 'text-emerald-400'}>{level}</span>
            </span>
          ))}
          <span className="ml-1 text-emerald-400">→ system default</span>
        </div>
        <p className="text-[11px] text-emerald-600">
          All fields are <span className="font-semibold">optional</span> — your bots work without any configuration here (using the platform default). Configure your own key if you want to use a specific model, manage costs separately, or have higher rate limits.
        </p>
      </div>

      {/* ── Account Default (client generic) ──────────────────────────── */}
      <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-green-50">
          <Cpu size={15} className="text-emerald-500" />
          <h3 className="text-sm font-semibold text-gray-800">Account Default</h3>
          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
            All your bots
          </span>
        </div>
        <div className="p-4">
          <LlmConfigCard
            label="Account Default"
            description="Used when no per-bot configuration is set. Applies across all your bots."
            tenantId={tenantId}
            productSlug={null}
            initial={configMap['__generic__'] ? maskConfig(configMap['__generic__']!) : null}
            accent="emerald"
          />
        </div>
      </div>

      {/* ── Per-Bot Configuration ──────────────────────────────────────── */}
      {activeSlugs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Cpu size={14} className="text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700">Per-Bot Override</h3>
            <span className="ml-auto text-[11px] text-gray-400">Overrides account default for that bot only</span>
          </div>
          <div className="space-y-3">
            {activeSlugs.map((slug: string) => {
              const meta = BOT_META[slug] ?? { name: slug, badge: 'bg-gray-100 text-gray-600 border-gray-200' };
              return (
                <div key={slug} className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2.5 px-5 py-4 border-b border-green-50">
                    <h4 className="text-sm font-semibold text-gray-800">{meta.name}</h4>
                    <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.badge}`}>
                      {slug.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="p-4">
                    <LlmConfigCard
                      label={meta.name}
                      description={`Overrides your account default specifically for the ${meta.name.toLowerCase()}.`}
                      tenantId={tenantId}
                      productSlug={slug}
                      initial={configMap[slug] ? maskConfig(configMap[slug]!) : null}
                      accent="emerald"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeSlugs.length === 0 && (
        <div className="text-center py-8 text-sm text-gray-400">
          No active bots found. Activate bots from your settings to configure per-bot models.
        </div>
      )}
    </div>
  );
}
