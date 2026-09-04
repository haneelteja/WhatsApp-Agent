'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import {
  LifeBuoy, TrendingUp, Zap, Check, Star, StarOff,
  Phone, Copy, ChevronDown, ChevronUp, PowerOff,
  Coins, Plus, X, ArrowLeft, CheckCircle2, ChevronRight,
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

// ── Bot catalog metadata ──────────────────────────────────────────────────────

const ALL_TYPES: ProductType[] = ['support_bot', 'sales_bot', 'lifecycle_bot'];

const BOT_META: Record<ProductType, {
  name:         string;
  tagline:      string;
  description:  string;
  capabilities: string[];
  icon:         React.ElementType;
  bg:           string;
  color:        string;
  borderColor:  string;
  price:        string;
  priceNote:    string;
  badge?:       string;
}> = {
  support_bot: {
    name:        'Support Bot',
    tagline:     'Customer care & issue resolution',
    description: 'Handles inbound customer queries end-to-end. Resolves common issues instantly using your knowledge base, and escalates complex cases to a human agent with full context.',
    capabilities: [
      'Instant answers from your Knowledge Base',
      'Auto-escalation with conversation summary',
      'Guardrails & blocked-topic enforcement',
      'Token-level usage tracking',
    ],
    icon:        LifeBuoy,
    bg:          'bg-sky-50',
    color:       'text-sky-600',
    borderColor: 'border-sky-200',
    price:       'Included in plan',
    priceNote:   'No additional cost',
  },
  sales_bot: {
    name:        'Sales Bot',
    tagline:     'Lead qualification & product discovery',
    description: 'Engages inbound leads, qualifies them against your criteria, shares product information, and notifies your sales team the moment a buyer is ready to talk.',
    capabilities: [
      'Lead qualification with custom questions',
      'Product catalogue Q&A',
      'Team notification on hot leads',
      'CRM-ready conversation logs',
    ],
    icon:        TrendingUp,
    bg:          'bg-violet-50',
    color:       'text-violet-600',
    borderColor: 'border-violet-200',
    price:       'Included in plan',
    priceNote:   'No additional cost',
  },
  lifecycle_bot: {
    name:        'Lifecycle Bot',
    tagline:     'Order tracking & post-purchase',
    description: 'Keeps customers informed after they buy — order status, invoice delivery, return requests, and re-engagement nudges — without any manual follow-up from your team.',
    capabilities: [
      'Real-time order status updates',
      'Invoice & document delivery',
      'Return & refund request handling',
      'Post-purchase re-engagement',
    ],
    icon:        Zap,
    bg:          'bg-orange-50',
    color:       'text-orange-600',
    borderColor: 'border-orange-200',
    price:       'Add-on module',
    priceNote:   'Contact sales to enable',
    badge:       'Add-on',
  },
};

const LOCAL_PRIMARY_KEY = 'alphabot_primary_bot';

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

// ── Step 1: Bot Catalog ───────────────────────────────────────────────────────

function BotCatalog({
  existingInstances,
  onSelect,
  onCancel,
}: {
  existingInstances: BotProduct[];
  onSelect: (type: ProductType) => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Choose a bot to add</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Select the bot type that fits your use case</p>
        </div>
        <button type="button" onClick={onCancel}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-3">
        {ALL_TYPES.map(type => {
          const meta = BOT_META[type];
          const Icon = meta.icon;
          const instanceCount = existingInstances.filter(p => p.product_type === type && p.active).length;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onSelect(type)}
              className={`w-full text-left rounded-2xl border-2 ${meta.borderColor} bg-white hover:shadow-md transition-all group p-5`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${meta.bg} ${meta.color}`}>
                  <Icon size={20} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-bold text-slate-800">{meta.name}</span>
                    {meta.badge && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600">
                        {meta.badge}
                      </span>
                    )}
                    {instanceCount > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        {instanceCount} active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500 mb-2">{meta.tagline}</p>
                  <p className="text-xs text-slate-500 leading-relaxed mb-3">{meta.description}</p>

                  <ul className="space-y-1 mb-3">
                    {meta.capabilities.map(cap => (
                      <li key={cap} className="flex items-center gap-2 text-[11px] text-slate-600">
                        <CheckCircle2 size={11} className={`shrink-0 ${meta.color}`} />
                        {cap}
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>
                        {meta.price}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-2">{meta.priceNote}</span>
                    </div>
                    <span className={`flex items-center gap-1 text-[11px] font-semibold ${meta.color} opacity-0 group-hover:opacity-100 transition-opacity`}>
                      Select <ChevronRight size={11} />
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 2: Setup Form ────────────────────────────────────────────────────────

function BotSetupForm({
  productType,
  isFirstInstance,
  availableNumbers,
  onDone,
  onBack,
}: {
  productType:      ProductType;
  isFirstInstance:  boolean;
  availableNumbers: WaNumber[];
  onDone: (bot: BotProduct, assignedNumberId: string | null) => void;
  onBack: () => void;
}) {
  const meta = BOT_META[productType];
  const Icon = meta.icon;

  const [instanceName, setInstanceName] = useState('');
  const [numberId,     setNumberId]     = useState('');
  const [pending,      startTx]         = useTransition();
  const [error,        setError]        = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!isFirstInstance) nameRef.current?.focus(); }, [isFirstInstance]);

  function handleConfirm() {
    setError('');
    if (!isFirstInstance && !instanceName.trim()) {
      setError('Give this instance a name so you can tell it apart from others.');
      return;
    }
    startTx(async () => {
      let slug: string;
      if (isFirstInstance) {
        // First instance: activate the bot type (slug = product_type)
        const res = await activateTenantProductAction(productType);
        if (res && 'error' in res) { setError(res.error ?? 'Unknown error'); return; }
        slug = productType;
      } else {
        // Additional instance: use addBotInstanceAction to get unique slug
        const res = await addBotInstanceAction(productType, instanceName.trim());
        if ('error' in res) { setError(res.error ?? 'Unknown error'); return; }
        slug = res.productSlug!;
      }

      // Optionally assign the selected number
      if (numberId) {
        await assignNumberToBotAction(numberId, slug as 'support_bot' | 'sales_bot' | 'lifecycle_bot');
      }

      onDone(
        {
          product_type:  productType,
          product_slug:  slug,
          instance_name: isFirstInstance ? 'Default' : instanceName.trim(),
          tier:          'base',
          active:        true,
        },
        numberId || null,
      );
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors shrink-0">
          <ArrowLeft size={14} />
        </button>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.bg} ${meta.color}`}>
            <Icon size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">{meta.name}</h3>
            <p className="text-[11px] text-slate-400">{isFirstInstance ? 'Set up your first instance' : 'Add another instance'}</p>
          </div>
        </div>
      </div>

      {/* Instance name (only for additional instances) */}
      {!isFirstInstance && (
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            Instance name <span className="text-red-400">*</span>
          </label>
          <input
            ref={nameRef}
            value={instanceName}
            onChange={e => setInstanceName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleConfirm()}
            placeholder={`e.g. Hindi, North India, Tier 1 Support`}
            maxLength={40}
            className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
          <p className="text-[10px] text-slate-400 mt-1">Used to identify this instance in the dashboard</p>
        </div>
      )}

      {/* Phone number selection */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          WhatsApp number <span className="text-slate-300">(optional)</span>
        </label>
        {availableNumbers.length > 0 ? (
          <>
            <select
              value={numberId}
              onChange={e => setNumberId(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            >
              <option value="">Skip for now</option>
              {availableNumbers.map(n => (
                <option key={n.id} value={n.id}>
                  {n.phone_number}{n.label ? ` — ${n.label}` : ''}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">Only unassigned numbers are shown. You can change this later.</p>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-[11px] text-slate-400">
            No unassigned numbers available. Add a number in the Workspace tab, then come back to assign it.
          </div>
        )}
      </div>

      {/* What this bot does — quick recap */}
      <div className={`rounded-xl ${meta.bg} border ${meta.borderColor} px-4 py-3 space-y-2`}>
        <p className={`text-[11px] font-semibold ${meta.color}`}>What this bot does</p>
        <ul className="space-y-1">
          {meta.capabilities.map(cap => (
            <li key={cap} className="flex items-center gap-2 text-[11px] text-slate-600">
              <CheckCircle2 size={10} className={`shrink-0 ${meta.color}`} />
              {cap}
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onBack} disabled={pending}
          className="flex-1 text-sm px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 font-semibold transition-colors">
          Back
        </button>
        <button type="button" onClick={handleConfirm} disabled={pending}
          className={`flex-1 text-sm px-4 py-2.5 rounded-xl text-white font-semibold transition-colors disabled:opacity-50 ${
            productType === 'lifecycle_bot'
              ? 'bg-orange-500 hover:bg-orange-600'
              : productType === 'sales_bot'
              ? 'bg-violet-600 hover:bg-violet-700'
              : 'bg-sky-600 hover:bg-sky-700'
          }`}>
          {pending ? 'Adding…' : 'Add bot'}
        </button>
      </div>
    </div>
  );
}

// ── Add Bot Modal/Panel ───────────────────────────────────────────────────────

type AddStep = { step: 'catalog' } | { step: 'setup'; type: ProductType; isFirst: boolean };

function AddBotFlow({
  existingProducts,
  availableNumbers,
  onDone,
  onClose,
}: {
  existingProducts: BotProduct[];
  availableNumbers: WaNumber[];
  onDone: (bot: BotProduct, assignedNumberId: string | null) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<AddStep>({ step: 'catalog' });

  function handleSelect(type: ProductType) {
    const isFirst = !existingProducts.some(p => p.product_type === type && p.active);
    setState({ step: 'setup', type, isFirst });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-5">
      {state.step === 'catalog' && (
        <BotCatalog
          existingInstances={existingProducts}
          onSelect={handleSelect}
          onCancel={onClose}
        />
      )}
      {state.step === 'setup' && (
        <BotSetupForm
          productType={state.type}
          isFirstInstance={state.isFirst}
          availableNumbers={availableNumbers}
          onDone={onDone}
          onBack={() => setState({ step: 'catalog' })}
        />
      )}
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
  numbers:        WaNumber[];
  tokenUsage:     BotTokenUsage[];
  isPrimary:      boolean;
  onSetPrimary:   (slug: string) => void;
  onDeactivated:  (slug: string) => void;
  onNumberChange: (numberId: string, newSlug: string | null) => void;
}) {
  const meta      = BOT_META[bot.product_type as ProductType] ?? BOT_META['support_bot'];
  const Icon      = meta.icon;
  const isDefault = bot.product_slug === bot.product_type;
  const webhookUrl = `${apiBase}/api/webhook/${tenantId}/${bot.product_slug}`;

  const assigned  = numbers.find(n => n.product_slug === bot.product_slug) ?? null;
  const available = numbers.filter(n => n.product_slug === null);
  const usage     = tokenUsage.find(u => u.product_slug === bot.product_slug)
                 ?? tokenUsage.find(u => !u.product_slug)
                 ?? null;

  const [expanded,  setExpanded]  = useState(false);
  const [pending,   startTx]      = useTransition();
  const [assigning, setAssigning] = useState(false);
  const [selectNum, setSelectNum] = useState('');

  const displayName = isDefault ? meta.name : `${meta.name} — ${bot.instance_name}`;

  function handleDeactivate() {
    if (!confirm(`Deactivate "${displayName}"? It will stop responding immediately.`)) return;
    startTx(async () => {
      await deactivateTenantProductAction(bot.product_slug);
      onDeactivated(bot.product_slug);
    });
  }

  async function handleAssign(nId: string) {
    setAssigning(true);
    await assignNumberToBotAction(nId, bot.product_slug as 'support_bot' | 'sales_bot' | 'lifecycle_bot');
    onNumberChange(nId, bot.product_slug);
    setAssigning(false);
    setSelectNum('');
  }

  async function handleUnassign(nId: string) {
    setAssigning(true);
    await assignNumberToBotAction(nId, null);
    onNumberChange(nId, null);
    setAssigning(false);
  }

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${isPrimary ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-green-100'}`}>
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
                <Star size={9} />Primary
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">{meta.tagline}</p>
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
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-50 px-5 py-4 space-y-4 bg-slate-50/40">
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Coins size={10} />Token Usage
            </p>
            {usage?.credit_info
              ? <UsageBar usage={usage.credit_info.usage} limit={usage.credit_info.limit} />
              : <span className="text-slate-400 text-xs">Using platform default</span>
            }
          </div>

          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Webhook URL</p>
            <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2">
              <code className="flex-1 text-[11px] text-emerald-700 font-mono break-all leading-relaxed">{webhookUrl}</code>
              <CopyButton text={webhookUrl} />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Phone size={10} />WhatsApp Number
            </p>
            {assigned ? (
              <div className="flex items-center justify-between gap-2 bg-white rounded-lg border border-slate-100 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Phone size={11} className="text-emerald-500 shrink-0" />
                  <span className="text-xs font-mono text-slate-700 truncate">{assigned.phone_number}</span>
                  {assigned.label && <span className="text-[10px] text-slate-400 truncate">{assigned.label}</span>}
                </div>
                <button type="button" disabled={assigning}
                  onClick={() => handleUnassign(assigned.id)}
                  className="text-[10px] font-semibold text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40 shrink-0">
                  {assigning ? '…' : 'Remove'}
                </button>
              </div>
            ) : available.length > 0 ? (
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
                    className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-semibold transition-colors">
                    {assigning ? '…' : 'Assign'}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                {numbers.length === 0
                  ? 'No phone numbers added yet — add one in the Workspace tab.'
                  : 'All numbers are assigned to other bots.'}
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 flex justify-end">
            <button type="button" disabled={pending} onClick={handleDeactivate}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-40 font-semibold">
              <PowerOff size={12} />Deactivate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BotsTabContent({ tenantId, apiBase, botProducts: initialProducts, numbers: initialNumbers, tokenUsage }: Props) {
  const [products,    setProducts]    = useState(initialProducts);
  const [numbers,     setNumbers]     = useState(initialNumbers);
  const [primarySlug, setPrimaryState] = useState<string | null>(null);
  const [showAdd,     setShowAdd]     = useState(false);

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

  function handleNumberChange(numberId: string, newSlug: string | null) {
    setNumbers(prev => prev.map(n => n.id === numberId ? { ...n, product_slug: newSlug } : n));
  }

  function handleBotAdded(bot: BotProduct, assignedNumberId: string | null) {
    setProducts(prev => {
      const exists = prev.find(p => p.product_slug === bot.product_slug);
      return exists
        ? prev.map(p => p.product_slug === bot.product_slug ? { ...p, active: true } : p)
        : [...prev, bot];
    });
    if (assignedNumberId) {
      setNumbers(prev => prev.map(n => n.id === assignedNumberId ? { ...n, product_slug: bot.product_slug } : n));
    }
    if (!primarySlug) setPrimary(bot.product_slug);
    setShowAdd(false);
  }

  const active    = products.filter(p => p.active);
  const available = numbers.filter(n => n.product_slug === null);

  // Group active instances by product_type, preserving ALL_TYPES order
  const grouped = ALL_TYPES.reduce<Record<string, BotProduct[]>>((acc, t) => {
    const instances = active.filter(p => p.product_type === t);
    if (instances.length > 0) acc[t] = instances;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {active.length === 0
            ? 'No bots active yet.'
            : `${active.length} bot instance${active.length !== 1 ? 's' : ''} active`}
        </p>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Plus size={13} />Add Bot
          </button>
        )}
      </div>

      {/* Add Bot flow (catalog → setup) */}
      {showAdd && (
        <AddBotFlow
          existingProducts={products}
          availableNumbers={available}
          onDone={handleBotAdded}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* Primary indicator */}
      {active.length > 1 && primarySlug && !showAdd && (() => {
        const p = active.find(b => b.product_slug === primarySlug);
        const meta = p ? BOT_META[p.product_type as ProductType] : null;
        const label = meta
          ? (p!.product_slug === p!.product_type ? meta.name : `${meta.name} — ${p!.instance_name}`)
          : primarySlug;
        return (
          <div className="flex items-center gap-2 px-1">
            <Star size={11} className="text-amber-400" />
            <p className="text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700">{label}</span> is your primary bot — default when no specific bot is selected. Tap ⭐ on any card to change.
            </p>
          </div>
        );
      })()}

      {/* Active bot instance cards grouped by type */}
      {!showAdd && Object.entries(grouped).map(([pt, instances]) => {
        const meta = BOT_META[pt as ProductType];
        const Icon = meta.icon;
        return (
          <div key={pt} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <div className={`w-5 h-5 rounded-md flex items-center justify-center ${meta.bg} ${meta.color}`}>
                <Icon size={11} />
              </div>
              <span className="text-xs font-bold text-slate-600">{meta.name}</span>
              <span className="text-[10px] text-slate-400">{instances.length} instance{instances.length !== 1 ? 's' : ''}</span>
            </div>
            {instances.map(bot => (
              <BotInstanceCard
                key={bot.product_slug}
                bot={bot}
                tenantId={tenantId}
                apiBase={apiBase}
                numbers={numbers}
                tokenUsage={tokenUsage}
                isPrimary={primarySlug === bot.product_slug}
                onSetPrimary={setPrimary}
                onDeactivated={handleDeactivated}
                onNumberChange={handleNumberChange}
              />
            ))}
          </div>
        );
      })}

      {active.length === 0 && !showAdd && (
        <div className="text-center py-10">
          <p className="text-slate-400 text-sm">Click <span className="font-semibold text-emerald-600">Add Bot</span> to get started.</p>
        </div>
      )}
    </div>
  );
}
