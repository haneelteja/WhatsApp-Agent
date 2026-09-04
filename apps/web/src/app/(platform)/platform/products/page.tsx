import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { Box, Info } from 'lucide-react';
import { ProductDefaultsForm } from '@/components/platform/ProductDefaultsForm';
import { AddProductModal } from '@/components/platform/AddProductModal';
import { CollapsibleCard } from '@/components/CollapsibleCard';

// Known bot type styles — new products fall back to the palette by index
const BOT_META: Record<string, {
  name:    string;
  desc:    string;
  color:   string;
  bg:      string;
  border:  string;
  modelBg: string;
}> = {
  support_bot: {
    name:    'Support Bot',
    desc:    'Customer Q&A, issue resolution, escalations',
    color:   'text-sky-600',
    bg:      'bg-sky-50',
    border:  'border-sky-200',
    modelBg: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  sales_bot: {
    name:    'Sales Bot',
    desc:    'Lead qualification & warm handoff to sales',
    color:   'text-violet-600',
    bg:      'bg-violet-50',
    border:  'border-violet-200',
    modelBg: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  lifecycle_bot: {
    name:    'Lifecycle Bot',
    desc:    'Order tracking, invoicing, payment collection',
    color:   'text-orange-600',
    bg:      'bg-orange-50',
    border:  'border-orange-200',
    modelBg: 'bg-orange-50 text-orange-700 border-orange-200',
  },
};

const PALETTE = [
  { color: 'text-teal-600',   bg: 'bg-teal-50',   border: 'border-teal-200',   modelBg: 'bg-teal-50 text-teal-700 border-teal-200'   },
  { color: 'text-rose-600',   bg: 'bg-rose-50',   border: 'border-rose-200',   modelBg: 'bg-rose-50 text-rose-700 border-rose-200'   },
  { color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200',  modelBg: 'bg-amber-50 text-amber-700 border-amber-200'  },
  { color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200', modelBg: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { color: 'text-pink-600',   bg: 'bg-pink-50',   border: 'border-pink-200',   modelBg: 'bg-pink-50 text-pink-700 border-pink-200'   },
];

export default async function ProductsPage() {
  const admin = getSupabaseAdminClient();

  const { data: products } = await admin
    .from('products')
    .select('slug, name, description, default_prompt, default_model, active')
    .order('slug');

  // Track how many fall through to the palette so we can cycle colors
  let paletteIdx = 0;

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Products</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Default system prompts and AI models for each bot type.
          </p>
        </div>
        <AddProductModal />
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
        <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-slate-500">
          <p className="font-semibold text-slate-600">How defaults work</p>
          <ul className="list-disc ml-4 space-y-0.5">
            <li>Default prompt is used when a client hasn&apos;t configured their own system prompt</li>
            <li>Default model is used when no per-client or per-bot AI Model is configured</li>
            <li>Guardrail rules are appended to the system prompt at inference time automatically</li>
            <li><span className="text-red-500 font-medium">Review carefully</span> — changes here affect all clients relying on defaults</li>
          </ul>
        </div>
      </div>

      {/* Product cards */}
      <div className="space-y-3">
        {(products ?? []).map(p => {
          const knownMeta = BOT_META[p.slug];
          const meta = knownMeta ?? {
            name:    p.name,
            desc:    p.description ?? '',
            ...PALETTE[paletteIdx % PALETTE.length]!,
          };
          if (!knownMeta) paletteIdx++;

          const promptPreview = p.default_prompt.length > 80
            ? p.default_prompt.slice(0, 80).trimEnd() + '…'
            : p.default_prompt;

          const header = (
            <div className="flex items-center gap-3 w-full min-w-0">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.bg} border ${meta.border}`}>
                <Box size={14} className={meta.color} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-semibold ${meta.color}`}>{meta.name}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${p.active ? `${meta.color} ${meta.border} bg-white` : 'text-slate-400 border-slate-200 bg-white'}`}>
                    {p.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-[11px] text-slate-400 truncate max-w-[240px]" title={p.default_prompt}>
                    {promptPreview}
                  </span>
                </div>
              </div>
              <span className={`text-[10px] font-mono px-2 py-1 rounded-lg border font-medium shrink-0 hidden sm:inline ${meta.modelBg}`}>
                {p.default_model}
              </span>
            </div>
          );

          return (
            <CollapsibleCard
              key={p.slug}
              header={header}
              borderClass={meta.border}
              defaultOpen={false}
            >
              <ProductDefaultsForm
                slug={p.slug}
                initialPrompt={p.default_prompt}
                initialModel={p.default_model}
              />
            </CollapsibleCard>
          );
        })}
      </div>

      {(!products || products.length === 0) && (
        <div className="text-center py-12 text-sm text-slate-400">
          No products found. Click &ldquo;Add Product&rdquo; to create your first bot type.
        </div>
      )}
    </div>
  );
}
