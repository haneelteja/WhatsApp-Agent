import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { Box } from 'lucide-react';
import { ProductDefaultsForm } from '@/components/platform/ProductDefaultsForm';

const BOT_META: Record<string, { name: string; desc: string; color: string; bg: string; border: string }> = {
  support_bot:   { name: 'Support Bot',   desc: 'Customer Q&A, issue resolution, escalations',  color: 'text-sky-600',    bg: 'bg-sky-50',    border: 'border-sky-200' },
  sales_bot:     { name: 'Sales Bot',     desc: 'Lead qualification & warm handoff to sales',    color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
  lifecycle_bot: { name: 'Lifecycle Bot', desc: 'Order tracking, invoicing, payment collection', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
};

export default async function ProductsPage() {
  const admin = getSupabaseAdminClient();

  const { data: products } = await admin
    .from('products')
    .select('slug, name, description, default_prompt, default_model, active')
    .order('slug');

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Products</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Manage default system prompts and AI models for each bot type.
          These defaults are used for any client that hasn&apos;t configured their own.
        </p>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 space-y-1">
        <p className="font-semibold text-slate-700">How defaults work</p>
        <ul className="list-disc ml-4 space-y-0.5 text-slate-500">
          <li>Default prompt is used when a client hasn't set their own system prompt</li>
          <li>Default model is used when a client hasn't selected a specific model</li>
          <li>Guardrails are layered on top of the system prompt automatically at inference time</li>
          <li>Changes here affect all existing clients who rely on defaults — review before saving</li>
        </ul>
      </div>

      <div className="space-y-4">
        {(products ?? []).map(p => {
          const meta = BOT_META[p.slug];
          if (!meta) return null;
          return (
            <div key={p.slug} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className={`flex items-center gap-3 px-5 py-4 border-b border-slate-100 ${meta.bg}`}>
                <Box size={16} className={meta.color} />
                <div>
                  <p className={`text-sm font-semibold ${meta.color}`}>{meta.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{meta.desc}</p>
                </div>
                <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-white ${meta.color} ${meta.border}`}>
                  {p.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="px-5 py-5">
                <ProductDefaultsForm
                  slug={p.slug}
                  initialPrompt={p.default_prompt}
                  initialModel={p.default_model}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
