'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import {
  LifeBuoy, TrendingUp, Zap, Check, Star, StarOff,
  Phone, Copy, ChevronDown, ChevronUp, Power, PowerOff,
  Coins, CheckCircle2, Plus, X,
} from 'lucide-react';
import {
  activateTenantProductAction,
  deactivateTenantProductAction,
  addBotInstanceAction,
  assignNumberToBotAction,
} from '@/app/actions/tenant-products';

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductType = 'support_bot' | 'sales_bot' | 'lifecycle_bot';

export interface BotProduct {
  product_type:  string;
  product_slug:  string;
  instance_name: string;
  tier:          string;
  active:        boolean;
}
export interface WaNumber {
  id:           string;
  phone_number: string;
  provider:     string;
  label:        string | null;
  product_slug: string | null;
}
export interface BotTokenUsage {
  product_slug: string | null;
  credit_info:  { usage: number | null; limit: number | null; is_free_tier: boolean } | null;
}

interface Props {
  tenantId:    string;
  apiBase:     string;
  botProducts: BotProduct[];
  numbers:     WaNumber[];
  tokenUsage:  BotTokenUsage[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCAL_PRIMARY_KEY = 'alphabot_primary_bot';

const ALL_TYPES: ProductType[] = ['support_bot', 'sales_bot', 'lifecycle_bot'];

const BOT_META: Record<ProductType, {
  name:        string;
  tagline:     string;
  description: string;
  icon:        React.ElementType;
  bg:          string;
  color:       string;
  price:       string;
}> = {
  support_bot: {
    name:        'Support Bot',
    tagline:     'Customer care & issue resolution',
    description: 'Answers customer questions, resolves issues, and escalates to human agents when needed.',
    icon:        LifeBuoy,
    bg:          'bg-sky-50',
    color:       'text-sky-600',
    price:       'Included in plan',
  },
  sales_bot: {
    name:        'Sales Bot',
    tagline:     'Lead qualification & product discovery',
    description: 'Qualifies leads, shares product information, and notifies your team when buyers are ready.',
    icon:        TrendingUp,
    bg:          'bg-violet-50',
    color:       'text-violet-600',
    price:       'Included in plan',
  },
  lifecycle_bot: {
    name:        'Lifecycle Bot',
    tagline:     'Order tracking & post-purchase',
    description: 'Handles order tracking, invoicing, and post-purchase customer success.',
    icon:        Zap,
    bg:          'bg-orange-50',
    color:       'text-orange-600',
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
    <button type="button" onClick={handleCopy} title="Copy"
      className="shrink-0 p-1 rounded-md hover:bg-white text-slate-400 hover:text-emerald-600 transition-colors">
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function UsageBar({ usage, limit }: { usage: number | null; limit: number | null }) {
  if (usage === null) return <span className="text-slate-400 text-xs">Using platform default</span>;
  const pct    = limit ? Math.min(100, Math.round((usage / limit) * 100)) : null;
  const colour = pct === null ? 'bg-slate-200' : pct > 80 ? 'bg-rose-400' : pct > 50 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="flex items-center gap-2 flex-1">
      {pct !== null && (
        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${colour}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
        {usage.toLocaleString()}{limit ? ` / ${limit.toLocaleString()} tokens` : ' tokens used'}
      </span>
    </div>
  );
}

// ── Add-Another mini-form ─────────────────────────────────────────────────────

function AddInstanceForm({
  productType,
  onAdded,
  onCancel,
}: {
  productType: ProductType;
  onAdded:  (bot: BotProduct) => void;
  onCancel: () => void;
}) {
  const meta = BOT_META[productType];
  const [name, setName]     = useState('');
  const [pending, startTx]  = useTransition();
  const [error, setError]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleAdd() {
    setError('');
    if (!name.trim()) { setError('Enter a name for this bot instance.'); return; }
    startTx(async () => {
      const res = await addBotInstanceAction(productType, name.trim());
      if ('error' in res) { setError(res.error ?? 'Unknown error'); return; }
      onAdded({
        product_type:  productType,
        product_slug:  res.productSlug!,
        instance_name: name.trim(),
        tier:          'base',
        active:        true,
      });
    });
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
      <p className="text-[11px] font-semibold text-slate-500">Name this {meta.name} instance</p>
      <p className="text-[10px] text-slate-400">E.g. &quot;Hindi&quot;, &quot;North India&quot;, &quot;Tier 1 Support&quot;</p>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') onCancel(); }}
          placeholder="Instance name…"
          className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          maxLength={40}
        />
        <button type="button" disabled={pending} onClick={handleAdd}
          className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-semibold transition-colors whitespace-nowrap">
          {pending ? '…' : 'Add'}
        </button>
        <button type="button" onClick={onCancel}
          className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
          <X size={13} />
        </button>
      </div>
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  );
}

// ── Active Bot Instance Card ──────────────────────────────────────────────────

function BotInstanceCard({
  bot,
  tenantId,
  apiBase,
  numbers,
  tokenUsage,
  isPrimary,
  onSetPrimary,
  onDeactivated,
  onNumberChange,
}: {
  bot:            BotProduct;
  tenantId:       string;
  apiBase:        string;
  numbers:        WaNumber[];       // full list — card derives available from this
  tokenUsage:     BotTokenUsage[];
  isPrimary:      boolean;
  onSetPrimary:   (slug: string) => void;
  onDeactivated:  (slug: string) => void;
  onNumberChange: (numberId: string, newSlug: string | null) => void;
}) {
  const meta       = BOT_META[bot.product_type as ProductType] ?? BOT_META['support_bot'];
  const Icon       = meta.icon;
  const webhookUrl = `${apiBase}/api/webhook/${tenantId}/${bot.product_slug}`;
  const isDefault  = bot.product_slug === bot.product_type;

  // Each bot gets exactly ONE assigned number
  const assigned = numbers.find(n => n.product_slug === bot.product_slug) ?? null;
  // Available = numbers not assigned to any bot (so shared exclusivity)
  const available = numbers.filter(n => n.product_slug === null);

  const usage = tokenUsage.find(u => u.product_slug === bot.product_slug)
             ?? tokenUsage.find(u => !u.product_slug)
             ?? null;

  const [expanded,   setExpanded]   = useState(false);
  const [pending,    startTx]       = useTransition();
  const [assigning,  setAssigning]  = useState(false);
  const [selectNum,  setSelectNum]  = useState('');

  const displayName = isDefault ? meta.name : `${meta.name} — ${bot.instance_name}`;

  function handleDeactivate() {
    if (!confirm(`Deactivate "${displayName}"? It will stop responding immediately.`)) return;
    startTx(async () => {
      await deactivateTenantProductAction(bot.product_slug);
      onDeactivated(bot.product_slug);
    });
  }

  async function handleAssign(numberId: string) {
    setAssigning(true);
    await assignNumberToBotAction(numberId, bot.product_slug as 'support_bot' | 'sales_bot' | 'lifecycle_bot');
    onNumberChange(numberId, bot.product_slug);
    setAssigning(false);
    setSelectNum('');
  }

  async function handleUnassign(numberId: string) {
    setAssigning(true);
    await assignNumberToBotAction(numberId, null);
    onNumberChange(numberId, null);
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
            <p className="text-sm font-bold text-slate-800">{displayName}</p>
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

          {/* Single assigned number pill */}
          <div className="mt-2">
            {assigned ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                <Phone size={9} />{assigned.phone_number}
              </span>
            ) : (
              <span className="text-[10px] text-amber-500 flex items-center gap-1">
                <Phone size={9} />No number assigned
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" title={isPrimary ? 'Primary bot' : 'Set as primary'}
            onClick={() => onSetPrimary(bot.product_slug)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              isPrimary ? 'bg-amber-50 text-amber-500' : 'text-slate-300 hover:bg-amber-50 hover:text-amber-400'
            }`}>
            {isPrimary ? <Star size={13} /> : <StarOff size={13} />}
          </button>
          <button type="button" onClick={() => setExpanded(e => !e)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
            title={expanded ? 'Collapse' : 'Configure'}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded config */}
      {expanded && (
        <div className="border-t border-slate-50 px-5 py-4 space-y-4 bg-slate-50/40">
          <p className="text-xs text-slate-500 leading-relaxed">{meta.description}</p>

          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Coins size={10} />Token Usage
            </p>
            {usage?.credit_info
              ? <UsageBar usage={usage.credit_info.usage} limit={usage.credit_info.limit} />
              : <span className="text-slate-400 text-xs">Using platform default — no usage data</span>
            }
          </div>

          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Plan</p>
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${meta.bg} ${meta.color}`}>{meta.price}</span>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Webhook URL</p>
            <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2">
              <code className="flex-1 text-[11px] text-emerald-700 font-mono break-all leading-relaxed">{webhookUrl}</code>
              <CopyButton text={webhookUrl} />
            </div>
          </div>

          {/* Number assignment — exactly one per bot */}
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Phone size={10} />WhatsApp Number
            </p>

            {assigned ? (
              /* Show assigned number with option to remove */
              <div className="flex items-center justify-between gap-2 bg-white rounded-lg border border-slate-100 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Phone size={11} className="text-emerald-500 shrink-0" />
                  <span className="text-xs font-mono text-slate-700 truncate">{assigned.phone_number}</span>
                  {assigned.label && <span className="text-[10px] text-slate-400 truncate">{assigned.label}</span>}
                </div>
                <button type="button" disabled={assigning}
                  onClick={() => handleUnassign(assigned.id)}
                  className="text-[10px] font-semibold text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40 shrink-0 whitespace-nowrap">
                  {assigning ? '…' : 'Remove'}
                </button>
              </div>
            ) : available.length > 0 ? (
              /* Show dropdown of unassigned numbers */
              <div className="flex items-center gap-2">
                <select value={selectNum} disabled={assigning}
                  onChange={e => setSelectNum(e.target.value)}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50">
                  <option value="" disabled>Select a number…</option>
                  {available.map(n => (
                    <option key={n.id} value={n.id}>
                      {n.phone_number}{n.label ? ` — ${n.label}` : ''}
                    </option>
                  ))}
                </select>
                {selectNum && (
                  <button type="button" disabled={assigning} onClick={() => handleAssign(selectNum)}
                    className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-semibold transition-colors whitespace-nowrap">
                    {assigning ? '…' : 'Assign'}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                {numbers.length === 0
                  ? 'No phone numbers added yet — add one in the Workspace tab.'
                  : 'All numbers are already assigned to other bots.'}
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 flex justify-end">
            <button type="button" disabled={pending}
              onClick={handleDeactivate}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-40 font-semibold">
              <PowerOff size={12} />Deactivate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bot Type Group ────────────────────────────────────────────────────────────

function BotTypeGroup({
  productType,
  instances,
  tenantId,
  apiBase,
  numbers,
  tokenUsage,
  primarySlug,
  onSetPrimary,
  onDeactivated,
  onInstanceAdded,
  onNumberChange,
}: {
  productType:     ProductType;
  instances:       BotProduct[];
  tenantId:        string;
  apiBase:         string;
  numbers:         WaNumber[];
  tokenUsage:      BotTokenUsage[];
  primarySlug:     string | null;
  onSetPrimary:    (slug: string) => void;
  onDeactivated:   (slug: string) => void;
  onInstanceAdded: (bot: BotProduct) => void;
  onNumberChange:  (numberId: string, newSlug: string | null) => void;
}) {
  const meta = BOT_META[productType];
  const Icon = meta.icon;
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="space-y-2">
      {/* Type header */}
      <div className="flex items-center gap-2 px-1">
        <div className={`w-6 h-6 rounded-md flex items-center justify-center ${meta.bg} ${meta.color}`}>
          <Icon size={12} />
        </div>
        <span className="text-xs font-bold text-slate-600">{meta.name}</span>
        <span className="text-[10px] text-slate-400">{instances.length} instance{instances.length !== 1 ? 's' : ''}</span>
        <button
          type="button"
          onClick={() => setShowAddForm(v => !v)}
          className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
        >
          <Plus size={11} />Add another
        </button>
      </div>

      {/* Instance cards */}
      {instances.map(bot => (
        <BotInstanceCard
          key={bot.product_slug}
          bot={bot}
          tenantId={tenantId}
          apiBase={apiBase}
          numbers={numbers}
          tokenUsage={tokenUsage}
          isPrimary={primarySlug === bot.product_slug}
          onSetPrimary={onSetPrimary}
          onDeactivated={onDeactivated}
          onNumberChange={onNumberChange}
        />
      ))}

      {/* Inline add-another form */}
      {showAddForm && (
        <div className="bg-white rounded-xl border border-dashed border-emerald-300 px-5 py-4">
          <AddInstanceForm
            productType={productType}
            onAdded={(bot) => { onInstanceAdded(bot); setShowAddForm(false); }}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}
    </div>
  );
}

// ── Inactive Type Card (zero instances) ───────────────────────────────────────

function InactiveTypeCard({ productType, onActivated }: { productType: ProductType; onActivated: (bot: BotProduct) => void }) {
  const meta   = BOT_META[productType];
  const Icon   = meta.icon;
  const [pending, startTx] = useTransition();

  function handleActivate() {
    startTx(async () => {
      await activateTenantProductAction(productType);
      onActivated({ product_type: productType, product_slug: productType, instance_name: 'Default', tier: 'base', active: true });
    });
  }

  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4 opacity-60">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.bg} ${meta.color}`}>
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-600">{meta.name}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{meta.tagline}</p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{meta.description}</p>
          <p className="text-[11px] text-slate-400 mt-1.5"><span className="font-semibold">{meta.price}</span></p>
        </div>
      </div>
      <div className="border-t border-dashed border-slate-200 px-5 py-3 flex items-center justify-between bg-slate-50/60">
        <span className="text-[11px] text-slate-400">Not activated</span>
        <button type="button" disabled={pending} onClick={handleActivate}
          className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-semibold transition-colors shadow-sm">
          <Power size={11} />
          {pending ? 'Activating…' : 'Add Bot'}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BotsTabContent({ tenantId, apiBase, botProducts: initialProducts, numbers: initialNumbers, tokenUsage }: Props) {
  const [products, setProducts]   = useState(initialProducts);
  // numbers in state so assignment changes reflect instantly across all bot cards
  const [numbers,  setNumbers]    = useState(initialNumbers);
  const [primarySlug, setPrimaryState] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_PRIMARY_KEY);
      if (saved && products.some(p => p.product_slug === saved && p.active)) setPrimaryState(saved);
    } catch {}
  }, [products]);

  function setPrimary(slug: string) {
    setPrimaryState(slug);
    try { localStorage.setItem(LOCAL_PRIMARY_KEY, slug); } catch {}
  }

  function handleDeactivated(slug: string) {
    setProducts(prev => prev.map(p => p.product_slug === slug ? { ...p, active: false } : p));
    if (primarySlug === slug) {
      const remaining = products.filter(p => p.product_slug !== slug && p.active);
      if (remaining.length > 0) setPrimary(remaining[0]!.product_slug);
      else { setPrimaryState(null); try { localStorage.removeItem(LOCAL_PRIMARY_KEY); } catch {} }
    }
  }

  function handleInstanceAdded(bot: BotProduct) {
    setProducts(prev => [...prev, bot]);
    if (!primarySlug) setPrimary(bot.product_slug);
  }

  function handleTypeActivated(bot: BotProduct) {
    setProducts(prev => {
      const exists = prev.find(p => p.product_slug === bot.product_slug);
      return exists ? prev.map(p => p.product_slug === bot.product_slug ? { ...p, active: true } : p) : [...prev, bot];
    });
    if (!primarySlug) setPrimary(bot.product_slug);
  }

  // Update local numbers state so dropdowns reflect instantly (no re-fetch needed)
  function handleNumberChange(numberId: string, newSlug: string | null) {
    setNumbers(prev => prev.map(n => n.id === numberId ? { ...n, product_slug: newSlug } : n));
  }

  const active   = products.filter(p => p.active);
  const inactive = ALL_TYPES.filter(t => !active.some(p => p.product_type === t));

  // Group active instances by product_type
  const grouped = ALL_TYPES.reduce<Record<string, BotProduct[]>>((acc, t) => {
    const instances = active.filter(p => p.product_type === t);
    if (instances.length > 0) acc[t] = instances;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {active.length === 0
            ? 'No bots active. Add one to start responding to WhatsApp messages.'
            : `${active.length} bot instance${active.length !== 1 ? 's' : ''} active`}
        </p>
        {active.length > 0 && primarySlug && (() => {
          const p = active.find(b => b.product_slug === primarySlug);
          const meta = p ? BOT_META[p.product_type as ProductType] : null;
          const label = meta ? (p!.product_slug === p!.product_type ? meta.name : `${meta.name} — ${p!.instance_name}`) : primarySlug;
          return (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full ring-1 ring-amber-200">
              <Star size={10} />{label} is primary
            </span>
          );
        })()}
      </div>

      {active.length > 1 && (
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-600">Each bot</span> can have one WhatsApp number assigned — numbers are exclusive and cannot be shared between bots.{' '}
            <span className="font-semibold text-slate-600">Primary bot</span> is the default view when no bot is selected. Tap ⭐ to change.
          </p>
        </div>
      )}

      {/* Active bot groups */}
      {Object.entries(grouped).map(([pt, instances]) => (
        <BotTypeGroup
          key={pt}
          productType={pt as ProductType}
          instances={instances}
          tenantId={tenantId}
          apiBase={apiBase}
          numbers={numbers}
          tokenUsage={tokenUsage}
          primarySlug={primarySlug}
          onSetPrimary={setPrimary}
          onDeactivated={handleDeactivated}
          onInstanceAdded={handleInstanceAdded}
          onNumberChange={handleNumberChange}
        />
      ))}

      {/* Available to add */}
      {inactive.length > 0 && (
        <div>
          {active.length > 0 && (
            <div className="flex items-center gap-3 my-4">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Available to add</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
          )}
          <div className="space-y-3">
            {inactive.map(pt => (
              <InactiveTypeCard key={pt} productType={pt} onActivated={handleTypeActivated} />
            ))}
          </div>
        </div>
      )}

      {inactive.length === 0 && active.length === ALL_TYPES.length && (
        <div className="flex items-center gap-2 py-3 justify-center">
          <CheckCircle2 size={14} className="text-emerald-500" />
          <p className="text-xs text-emerald-600 font-semibold">All bot types are active</p>
        </div>
      )}
    </div>
  );
}
