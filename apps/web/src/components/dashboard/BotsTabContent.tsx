'use client';

import { useState, useTransition, useEffect } from 'react';
import {
  LifeBuoy, TrendingUp, Zap, Bot, Check, Star, StarOff,
  Phone, Copy, ChevronDown, ChevronUp, Power, PowerOff,
  Coins, CheckCircle2,
} from 'lucide-react';
import {
  activateTenantProductAction,
  deactivateTenantProductAction,
  assignNumberToBotAction,
} from '@/app/actions/tenant-products';

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductType = 'support_bot' | 'sales_bot' | 'lifecycle_bot';

export interface BotProduct {
  product_type: string;
  tier:         string;
  active:       boolean;
}
export interface WaNumber {
  id:           string;
  phone_number: string;
  provider:     string;
  label:        string | null;
  product_slug: string | null;
}
export interface BotTokenUsage {
  product_slug:  string | null;
  credit_info:   { usage: number | null; limit: number | null; is_free_tier: boolean } | null;
}

interface Props {
  tenantId:     string;
  apiBase:      string;
  botProducts:  BotProduct[];
  numbers:      WaNumber[];
  tokenUsage:   BotTokenUsage[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCAL_PRIMARY_KEY = 'alphabot_primary_bot';

const ALL_BOTS: ProductType[] = ['support_bot', 'sales_bot', 'lifecycle_bot'];

const BOT_META: Record<ProductType, {
  name: string;
  tagline: string;
  description: string;
  icon: React.ElementType;
  bg: string;
  color: string;
  ring: string;
  inactiveBg: string;
  price: string;
}> = {
  support_bot: {
    name:        'Support Bot',
    tagline:     'Customer care & issue resolution',
    description: 'Answers customer questions, resolves issues, and escalates to human agents when needed.',
    icon:        LifeBuoy,
    bg:          'bg-sky-50',
    color:       'text-sky-600',
    ring:        'ring-sky-200',
    inactiveBg:  'bg-sky-50/50',
    price:       'Included in plan',
  },
  sales_bot: {
    name:        'Sales Bot',
    tagline:     'Lead qualification & product discovery',
    description: 'Qualifies leads, shares product information, and notifies your team when buyers are ready.',
    icon:        TrendingUp,
    bg:          'bg-violet-50',
    color:       'text-violet-600',
    ring:        'ring-violet-200',
    inactiveBg:  'bg-violet-50/40',
    price:       'Included in plan',
  },
  lifecycle_bot: {
    name:        'Lifecycle Bot',
    tagline:     'Order tracking & post-purchase',
    description: 'Handles order tracking, invoicing, and post-purchase customer success.',
    icon:        Zap,
    bg:          'bg-orange-50',
    color:       'text-orange-600',
    ring:        'ring-orange-200',
    inactiveBg:  'bg-orange-50/40',
    price:       'Add-on module',
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy"
      className="shrink-0 p-1 rounded-md hover:bg-white text-slate-400 hover:text-emerald-600 transition-colors"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function UsageBar({ usage, limit }: { usage: number | null; limit: number | null }) {
  if (usage === null) return <span className="text-slate-400">— not tracked</span>;
  const pct = limit ? Math.min(100, Math.round((usage / limit) * 100)) : null;
  const colour = pct === null ? 'bg-slate-200' : pct > 80 ? 'bg-rose-400' : pct > 50 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="flex items-center gap-2 flex-1">
      {pct !== null && (
        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${colour}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
        {usage.toLocaleString()}
        {limit ? ` / ${limit.toLocaleString()} tokens` : ' tokens used'}
      </span>
    </div>
  );
}

// ── Active Bot Card ───────────────────────────────────────────────────────────

function ActiveBotCard({
  pt,
  tenantId,
  apiBase,
  numbers,
  tokenUsage,
  isPrimary,
  onSetPrimary,
  onDeactivated,
  disabled,
}: {
  pt:            ProductType;
  tenantId:      string;
  apiBase:       string;
  numbers:       WaNumber[];
  tokenUsage:    BotTokenUsage[];
  isPrimary:     boolean;
  onSetPrimary:  (slug: string) => void;
  onDeactivated: (slug: string) => void;
  disabled:      boolean;
}) {
  const meta     = BOT_META[pt];
  const Icon     = meta.icon;
  const webhookUrl = `${apiBase}/api/webhook/${tenantId}/${pt}`;
  const assigned   = numbers.filter(n => n.product_slug === pt);
  const unassigned = numbers.filter(n => !n.product_slug);
  const usage      = tokenUsage.find(u => u.product_slug === pt) ?? tokenUsage.find(u => !u.product_slug) ?? null;

  const [expanded,  setExpanded]  = useState(false);
  const [pending,   startTx]      = useTransition();
  const [assigning, setAssigning] = useState(false);
  const [selectNum, setSelectNum] = useState('');

  function handleDeactivate() {
    if (!confirm(`Deactivate ${meta.name}? It will stop responding to messages immediately.`)) return;
    startTx(async () => {
      await deactivateTenantProductAction(pt);
      onDeactivated(pt);
    });
  }

  async function handleAssign(numberId: string) {
    setAssigning(true);
    await assignNumberToBotAction(numberId, pt);
    setAssigning(false);
    setSelectNum('');
  }

  async function handleUnassign(numberId: string) {
    setAssigning(true);
    await assignNumberToBotAction(numberId, null);
    setAssigning(false);
  }

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${isPrimary ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-green-100'}`}>
      {/* Header */}
      <div className="flex items-start gap-3 px-5 py-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.bg} ${meta.color}`}>
          <Icon size={18} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-800">{meta.name}</p>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Active
            </span>
            {isPrimary && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full ring-1 ring-amber-200">
                <Star size={9} />
                Primary
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">{meta.tagline}</p>

          {/* Assigned phone numbers inline */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {assigned.length > 0 ? assigned.map(n => (
              <span key={n.id} className="inline-flex items-center gap-1 text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                <Phone size={9} />
                {n.phone_number}
              </span>
            )) : (
              <span className="text-[10px] text-amber-500 flex items-center gap-1">
                <Phone size={9} />
                No number assigned
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            title={isPrimary ? 'Primary bot' : 'Set as primary'}
            onClick={() => onSetPrimary(pt)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              isPrimary
                ? 'bg-amber-50 text-amber-500'
                : 'text-slate-300 hover:bg-amber-50 hover:text-amber-400'
            }`}
          >
            {isPrimary ? <Star size={13} /> : <StarOff size={13} />}
          </button>
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
            title={expanded ? 'Collapse' : 'Configure'}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded config */}
      {expanded && (
        <div className="border-t border-slate-50 px-5 py-4 space-y-4 bg-slate-50/40">
          <p className="text-xs text-slate-500 leading-relaxed">{meta.description}</p>

          {/* Token usage */}
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Coins size={10} />
              Token Usage
            </p>
            <div className="flex items-center gap-2 text-xs">
              {usage?.credit_info
                ? <UsageBar usage={usage.credit_info.usage} limit={usage.credit_info.limit} />
                : <span className="text-slate-400 text-xs">Using platform default — no usage data</span>
              }
            </div>
          </div>

          {/* Price / tier */}
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Plan</p>
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${meta.bg} ${meta.color}`}>
              {meta.price}
            </span>
          </div>

          {/* Webhook URL */}
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Webhook URL</p>
            <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2">
              <code className="flex-1 text-[11px] text-emerald-700 font-mono break-all leading-relaxed">{webhookUrl}</code>
              <CopyButton text={webhookUrl} />
            </div>
          </div>

          {/* Phone number management */}
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Phone size={10} />
              Assigned Numbers
            </p>
            {assigned.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {assigned.map(n => (
                  <div key={n.id} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-slate-100 px-3 py-2">
                    <span className="text-xs font-mono text-slate-700">{n.phone_number}</span>
                    {n.label && <span className="text-[10px] text-slate-400">{n.label}</span>}
                    <button
                      type="button"
                      disabled={assigning || disabled}
                      onClick={() => handleUnassign(n.id)}
                      className="text-[10px] text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {unassigned.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={selectNum}
                  disabled={assigning || disabled}
                  onChange={(e) => setSelectNum(e.target.value)}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50"
                >
                  <option value="" disabled>Add a number…</option>
                  {unassigned.map(n => (
                    <option key={n.id} value={n.id}>{n.phone_number}{n.label ? ` — ${n.label}` : ''}</option>
                  ))}
                </select>
                {selectNum && (
                  <button
                    type="button"
                    disabled={assigning || disabled}
                    onClick={() => handleAssign(selectNum)}
                    className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-semibold transition-colors whitespace-nowrap"
                  >
                    {assigning ? '…' : 'Assign'}
                  </button>
                )}
              </div>
            )}

            {unassigned.length === 0 && assigned.length === 0 && (
              <p className="text-xs text-slate-400 italic">No phone numbers added yet. Add one in WhatsApp Numbers above.</p>
            )}
          </div>

          {/* Deactivate */}
          <div className="pt-2 border-t border-slate-100 flex justify-end">
            <button
              type="button"
              disabled={pending || disabled}
              onClick={handleDeactivate}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-40 font-semibold"
            >
              <PowerOff size={12} />
              Deactivate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inactive Bot Card ─────────────────────────────────────────────────────────

function InactiveBotCard({
  pt,
  onActivated,
  disabled,
}: {
  pt:          ProductType;
  onActivated: (slug: string) => void;
  disabled:    boolean;
}) {
  const meta    = BOT_META[pt];
  const Icon    = meta.icon;
  const [pending, startTx] = useTransition();

  function handleActivate() {
    startTx(async () => {
      await activateTenantProductAction(pt);
      onActivated(pt);
    });
  }

  return (
    <div className={`rounded-2xl border border-dashed border-slate-200 bg-white/60 overflow-hidden`}>
      <div className="flex items-start gap-3 px-5 py-4 opacity-60">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.bg} ${meta.color}`}>
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-600">{meta.name}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{meta.tagline}</p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{meta.description}</p>
          <p className="text-[11px] text-slate-400 mt-1.5">
            <span className="font-semibold">{meta.price}</span>
          </p>
        </div>
      </div>
      <div className="border-t border-dashed border-slate-200 px-5 py-3 flex items-center justify-between bg-slate-50/60">
        <span className="text-[11px] text-slate-400">Not activated</span>
        <button
          type="button"
          disabled={pending || disabled}
          onClick={handleActivate}
          className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-semibold transition-colors shadow-sm"
        >
          <Power size={11} />
          {pending ? 'Activating…' : 'Add Bot'}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BotsTabContent({ tenantId, apiBase, botProducts: initialProducts, numbers: initialNumbers, tokenUsage }: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [numbers,  setNumbers]  = useState(initialNumbers);
  const [primaryBot, setPrimaryBotState] = useState<string | null>(null);

  // Load primary bot from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_PRIMARY_KEY);
      if (saved) setPrimaryBotState(saved);
    } catch {}
  }, []);

  function setPrimary(slug: string) {
    setPrimaryBotState(slug);
    try { localStorage.setItem(LOCAL_PRIMARY_KEY, slug); } catch {}
  }

  const activeSet   = new Set(products.filter(p => p.active).map(p => p.product_type));
  const activeBots  = ALL_BOTS.filter(pt => activeSet.has(pt));
  const inactiveBots = ALL_BOTS.filter(pt => !activeSet.has(pt));

  function handleDeactivated(slug: string) {
    setProducts(prev => prev.map(p => p.product_type === slug ? { ...p, active: false } : p));
    if (primaryBot === slug) {
      const remaining = activeBots.filter(b => b !== slug);
      if (remaining.length > 0) {
        setPrimary(remaining[0]!);
      } else {
        setPrimaryBotState(null);
        try { localStorage.removeItem(LOCAL_PRIMARY_KEY); } catch {}
      }
    }
  }

  function handleActivated(slug: string) {
    setProducts(prev => {
      const existing = prev.find(p => p.product_type === slug);
      if (existing) return prev.map(p => p.product_type === slug ? { ...p, active: true } : p);
      return [...prev, { product_type: slug, tier: 'base', active: true }];
    });
    if (!primaryBot) setPrimary(slug);
  }

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {activeBots.length === 0
            ? 'No bots active. Add one to start responding to WhatsApp messages.'
            : `${activeBots.length} bot${activeBots.length !== 1 ? 's' : ''} active`}
        </p>
        {activeBots.length > 0 && primaryBot && (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full ring-1 ring-amber-200">
            <Star size={10} />
            {BOT_META[primaryBot as ProductType]?.name ?? primaryBot} is primary
          </span>
        )}
      </div>

      {/* What "primary" means */}
      {activeBots.length > 1 && (
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-600">Primary bot</span> — the default view when you open Conversations or Knowledge Base without a specific bot selected. Tap ⭐ on a bot to set it as primary.
          </p>
        </div>
      )}

      {/* Active bots */}
      {activeBots.length > 0 && (
        <div className="space-y-3">
          {activeBots.map(pt => (
            <ActiveBotCard
              key={pt}
              pt={pt}
              tenantId={tenantId}
              apiBase={apiBase}
              numbers={numbers}
              tokenUsage={tokenUsage}
              isPrimary={primaryBot === pt}
              onSetPrimary={setPrimary}
              onDeactivated={handleDeactivated}
              disabled={false}
            />
          ))}
        </div>
      )}

      {/* Available bots to add */}
      {inactiveBots.length > 0 && (
        <div>
          {activeBots.length > 0 && (
            <div className="flex items-center gap-3 my-4">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Available to add</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
          )}
          <div className="space-y-3">
            {inactiveBots.map(pt => (
              <InactiveBotCard
                key={pt}
                pt={pt}
                onActivated={handleActivated}
                disabled={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* All active checkmark */}
      {inactiveBots.length === 0 && activeBots.length === ALL_BOTS.length && (
        <div className="flex items-center gap-2 py-3 justify-center">
          <CheckCircle2 size={14} className="text-emerald-500" />
          <p className="text-xs text-emerald-600 font-semibold">All available bots are active</p>
        </div>
      )}
    </div>
  );
}
