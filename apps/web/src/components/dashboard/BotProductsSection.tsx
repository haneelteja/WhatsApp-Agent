'use client';

import { useState, useTransition } from 'react';
import { LifeBuoy, TrendingUp, Zap, Copy, Check } from 'lucide-react';
import { activateTenantProductAction, deactivateTenantProductAction, assignNumberToBotAction } from '@/app/actions/tenant-products';

type ProductType = 'support_bot' | 'sales_bot' | 'lifecycle_bot';

const BOT_META: Record<ProductType, { name: string; icon: React.ReactNode; description: string; bg: string; color: string }> = {
  support_bot: {
    name: 'Support Bot',
    icon: <LifeBuoy size={17} />,
    description: 'Answers customer questions, resolves issues, and escalates to human agents when needed.',
    bg: 'bg-sky-50', color: 'text-sky-600',
  },
  sales_bot: {
    name: 'Sales Bot',
    icon: <TrendingUp size={17} />,
    description: 'Qualifies leads, shares product information, and notifies your team when buyers are ready.',
    bg: 'bg-violet-50', color: 'text-violet-600',
  },
  lifecycle_bot: {
    name: 'Lifecycle Bot',
    icon: <Zap size={17} />,
    description: 'Handles order tracking, invoicing, and post-purchase customer success.',
    bg: 'bg-orange-50', color: 'text-orange-600',
  },
};

const ALL_PRODUCTS: ProductType[] = ['support_bot', 'sales_bot', 'lifecycle_bot'];

interface TenantProduct { product_type: string; tier: string; active: boolean }
interface WhatsAppNumber { id: string; phone_number: string; provider: string; label: string | null; product_slug: string | null }

interface Props {
  tenantId: string;
  apiBase: string;
  tenantProducts: TenantProduct[];
  numbers: WhatsAppNumber[];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button type="button" onClick={handleCopy} className="shrink-0 p-1.5 rounded-md hover:bg-emerald-100 text-emerald-500 hover:text-emerald-700 transition-colors">
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

export function BotProductsSection({ tenantId, apiBase, tenantProducts: initialProducts, numbers: initialNumbers }: Props) {
  const [pending, startTransition] = useTransition();
  const [actioningBot, setActioningBot] = useState<ProductType | null>(null);
  const [products, setProducts] = useState(initialProducts);
  const [numbers, setNumbers] = useState(initialNumbers);

  const activeSet = new Set(products.filter(p => p.active).map(p => p.product_type));

  function handleActivate(pt: ProductType) {
    setActioningBot(pt);
    startTransition(async () => {
      await activateTenantProductAction(pt);
      setProducts(prev => {
        const exists = prev.find(p => p.product_type === pt);
        if (exists) return prev.map(p => p.product_type === pt ? { ...p, active: true } : p);
        return [...prev, { product_type: pt, tier: 'base', active: true }];
      });
      setActioningBot(null);
    });
  }

  function handleDeactivate(pt: ProductType) {
    setActioningBot(pt);
    startTransition(async () => {
      await deactivateTenantProductAction(pt);
      setProducts(prev => prev.map(p => p.product_type === pt ? { ...p, active: false } : p));
      setActioningBot(null);
    });
  }

  function handleAssignNumber(numberId: string, productSlug: ProductType | null) {
    startTransition(async () => {
      await assignNumberToBotAction(numberId, productSlug);
      setNumbers(prev => prev.map(n => n.id === numberId ? { ...n, product_slug: productSlug } : n));
    });
  }

  return (
    <div className="space-y-3 px-5 py-4">
      {ALL_PRODUCTS.map(pt => {
        const meta = BOT_META[pt];
        const isActive = activeSet.has(pt);
        const isLoading = actioningBot === pt && pending;
        const webhookUrl = `${apiBase}/api/webhook/${tenantId}/${pt}`;
        const assignedNumbers = numbers.filter(n => n.product_slug === pt);

        return (
          <div
            key={pt}
            className={`rounded-xl border p-4 transition-all ${isActive ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200 bg-white'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${meta.bg} ${meta.color}`}>
                  {meta.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{meta.name}</p>
                    {isActive && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{meta.description}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isLoading || pending}
                onClick={() => isActive ? handleDeactivate(pt) : handleActivate(pt)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 ${
                  isActive
                    ? 'border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-500 hover:border-red-200'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                }`}
              >
                {isLoading ? '…' : isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>

            {isActive && (
              <div className="mt-3 pt-3 border-t border-emerald-100 space-y-2">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Webhook URL</p>
                  <div className="flex items-center gap-2 bg-white rounded-lg border border-emerald-100 px-3 py-2">
                    <code className="flex-1 text-xs text-emerald-700 font-mono break-all">{webhookUrl}</code>
                    <CopyButton text={webhookUrl} />
                  </div>
                </div>

                {/* WhatsApp number assignment */}
                {numbers.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Assigned Phone Numbers</p>
                    {assignedNumbers.length > 0 ? (
                      <div className="space-y-1.5">
                        {assignedNumbers.map(n => (
                          <div key={n.id} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-emerald-100 px-3 py-2">
                            <span className="text-xs font-mono text-slate-700">{n.phone_number}</span>
                            {n.label && <span className="text-[11px] text-slate-400">{n.label}</span>}
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => handleAssignNumber(n.id, null)}
                              className="text-[10px] text-slate-400 hover:text-red-500 transition-colors shrink-0 disabled:opacity-50"
                            >
                              Unassign
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No numbers assigned — assign one below.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Unassigned numbers */}
      {numbers.filter(n => !n.product_slug).length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <p className="text-xs font-semibold text-amber-700 mb-2">Unassigned Numbers</p>
          <div className="space-y-2">
            {numbers.filter(n => !n.product_slug).map(n => (
              <div key={n.id} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-amber-100 px-3 py-2">
                <div>
                  <span className="text-xs font-mono text-slate-700">{n.phone_number}</span>
                  {n.label && <span className="text-[11px] text-slate-400 ml-2">{n.label}</span>}
                </div>
                <select
                  disabled={pending}
                  defaultValue=""
                  onChange={(e) => {
                    const val = e.target.value as ProductType;
                    if (val) handleAssignNumber(n.id, val);
                  }}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                >
                  <option value="" disabled>Assign to bot…</option>
                  {ALL_PRODUCTS.filter(pt => activeSet.has(pt)).map(pt => (
                    <option key={pt} value={pt}>{BOT_META[pt].name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
