'use client';

import { useState, useTransition } from 'react';
import { Bot, Plus, Power } from 'lucide-react';
import { toggleClientProductAction } from '@/app/actions/products';

const ALL_PRODUCTS = [
  { slug: 'support_bot',   name: 'Support Bot',   desc: 'Q&A, issue resolution, escalations',  color: 'text-sky-600',    bg: 'bg-sky-50',    border: 'border-sky-200',    activeBg: 'bg-sky-50' },
  { slug: 'sales_bot',     name: 'Sales Bot',     desc: 'Lead qualification & warm handoff',   color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200', activeBg: 'bg-violet-50' },
  { slug: 'lifecycle_bot', name: 'Lifecycle Bot', desc: 'Orders, invoicing, payments',         color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', activeBg: 'bg-orange-50' },
];

type ProductRow = { product_type: string; active: boolean; tier: string };

export function ClientProductsManager({
  tenantId,
  initialProducts,
}: {
  tenantId: string;
  initialProducts: ProductRow[];
}) {
  const [products, setProducts] = useState<ProductRow[]>(initialProducts);
  const [pending, startTransition] = useTransition();
  const [toggling, setToggling] = useState<string | null>(null);

  function getProduct(slug: string) {
    return products.find(p => p.product_type === slug);
  }

  function toggle(slug: string) {
    const current = getProduct(slug);
    const nextActive = !current?.active;

    setToggling(slug);
    startTransition(async () => {
      await toggleClientProductAction(tenantId, slug, nextActive);

      setProducts(prev => {
        const exists = prev.find(p => p.product_type === slug);
        if (exists) {
          return prev.map(p => p.product_type === slug ? { ...p, active: nextActive } : p);
        }
        return [...prev, { product_type: slug, active: true, tier: 'base' }];
      });

      setToggling(null);
    });
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {ALL_PRODUCTS.map(meta => {
        const row     = getProduct(meta.slug);
        const isActive = row?.active ?? false;
        const isNew    = !row;
        const isLoading = toggling === meta.slug && pending;

        return (
          <div
            key={meta.slug}
            className={`rounded-xl border p-4 transition-all ${
              isActive
                ? `${meta.bg} ${meta.border}`
                : 'bg-slate-50 border-slate-200 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isActive ? 'bg-white border border-white/50' : 'bg-slate-100'}`}>
                <Bot size={14} className={isActive ? meta.color : 'text-slate-400'} />
              </div>
              {isNew ? (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">
                  Not assigned
                </span>
              ) : (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/80 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  {isActive ? 'Active' : 'Inactive'}
                </span>
              )}
            </div>

            <p className={`text-sm font-semibold ${isActive ? meta.color : 'text-slate-500'}`}>{meta.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{meta.desc}</p>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => toggle(meta.slug)}
              className={`mt-4 w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                isActive
                  ? 'bg-white/80 text-red-500 hover:bg-red-50 border border-red-100'
                  : 'bg-white text-emerald-600 hover:bg-emerald-50 border border-emerald-200'
              }`}
            >
              {isLoading ? (
                'Updating…'
              ) : isActive ? (
                <><Power size={11} /> Deactivate</>
              ) : (
                <><Plus size={11} /> Activate</>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
