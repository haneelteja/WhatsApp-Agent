'use client';

import { useState, useTransition } from 'react';
import { Check, CreditCard, Calendar, RefreshCw } from 'lucide-react';
import {
  updateTenantPlanAction,
  updateTenantStatusAction,
  upsertSubscriptionAction,
  grantFreeTrialAction,
  revokeTrialAction,
  type TenantPlan,
  type TenantStatus,
} from '@/app/actions/billing';

const PLAN_META: Record<TenantPlan, { name: string; color: string; bg: string; border: string; ring: string; bots: number; conversations: string }> = {
  starter: { name: 'Starter', color: 'text-slate-700',  bg: 'bg-slate-50',   border: 'border-slate-300',  ring: 'ring-slate-400',  bots: 1, conversations: '500 / mo' },
  growth:  { name: 'Growth',  color: 'text-violet-700', bg: 'bg-violet-50',  border: 'border-violet-300', ring: 'ring-violet-400', bots: 2, conversations: '2,000 / mo' },
  scale:   { name: 'Scale',   color: 'text-emerald-700',bg: 'bg-emerald-50', border: 'border-emerald-300',ring: 'ring-emerald-400',bots: 3, conversations: 'Unlimited' },
};

const STATUS_META: Record<TenantStatus, { label: string; bg: string; text: string; border: string }> = {
  active:    { label: 'Active',    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300' },
  trial:     { label: 'Trial',     bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-300'     },
  suspended: { label: 'Suspended', bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-300'     },
};

const BOT_META: Record<string, { name: string; color: string }> = {
  support_bot:   { name: 'Support Bot',   color: 'text-sky-600'    },
  sales_bot:     { name: 'Sales Bot',     color: 'text-violet-600' },
  lifecycle_bot: { name: 'Lifecycle Bot', color: 'text-orange-600' },
};

const CLAUDE_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-opus-4-7',
];

interface SubscriptionRow {
  product_type:      string;
  tier:              string | null;
  billing_cycle:     string | null;
  next_billing_date: string | null;
}

interface TrialRow {
  product_slug: string;
  ends_at:      string;
  status:       string;
  allowed_model:string;
}

interface Props {
  tenantId:    string;
  initialPlan:   TenantPlan;
  initialStatus: TenantStatus;
  activeBots:  { product_type: string }[];
  subs:        SubscriptionRow[];
  trials:      TrialRow[];
}

function SubscriptionCard({
  tenantId,
  bot,
  sub,
  trial,
}: {
  tenantId: string;
  bot:      { product_type: string };
  sub:      SubscriptionRow | null;
  trial:    TrialRow | null;
}) {
  const [editing,       setEditing]       = useState(false);
  const [pending,       startTransition]  = useTransition();
  const [error,         setError]         = useState<string | null>(null);
  const [tier,          setTier]          = useState(sub?.tier ?? 'starter');
  const [cycle,         setCycle]         = useState(sub?.billing_cycle ?? 'monthly');
  const [nextBill,      setNextBill]      = useState(sub?.next_billing_date ?? '');
  const [trialEnd,      setTrialEnd]      = useState('');
  const [trialModel,    setTrialModel]    = useState('claude-sonnet-4-6');
  const [showTrialForm, setShowTrialForm] = useState(false);

  const meta      = BOT_META[bot.product_type];
  const activeTrial = trial?.status === 'active' ? trial : null;

  function saveSub() {
    setError(null);
    startTransition(async () => {
      const res = await upsertSubscriptionAction(tenantId, bot.product_type, {
        tier, billing_cycle: cycle, next_billing_date: nextBill,
      });
      if ('error' in res) setError(res.error);
      else setEditing(false);
    });
  }

  function grantTrial() {
    if (!trialEnd) return;
    setError(null);
    startTransition(async () => {
      const res = await grantFreeTrialAction(tenantId, bot.product_type, {
        ends_at: new Date(trialEnd).toISOString(),
        allowed_model: trialModel,
      });
      if ('error' in res) setError(res.error);
      else setShowTrialForm(false);
    });
  }

  function revokeTrial() {
    startTransition(async () => {
      await revokeTrialAction(tenantId, bot.product_type);
    });
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className={`text-sm font-semibold ${meta?.color ?? 'text-slate-700'}`}>{meta?.name ?? bot.product_type}</p>
        <button
          type="button"
          onClick={() => { setEditing(e => !e); setError(null); }}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
        >
          {editing ? 'Cancel' : sub ? 'Edit' : 'Configure'}
        </button>
      </div>

      {!editing ? (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Tier</p>
            <p className="font-medium text-slate-700 capitalize mt-0.5">{sub?.tier ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Cycle</p>
            <p className="font-medium text-slate-700 capitalize mt-0.5">{sub?.billing_cycle ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Next Bill</p>
            <p className="font-medium text-slate-700 mt-0.5">
              {sub?.next_billing_date ? new Date(sub.next_billing_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Tier</label>
              <select value={tier} onChange={e => setTier(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white capitalize">
                {['starter', 'growth', 'scale'].map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Billing Cycle</label>
              <select value={cycle} onChange={e => setCycle(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Next Billing Date</label>
            <input type="date" value={nextBill} onChange={e => setNextBill(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button type="button" onClick={saveSub} disabled={pending} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            <Check size={12} /> {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {/* Free trial */}
      <div className="border-t border-slate-100 pt-2.5">
        {activeTrial ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold text-sky-700">Active Trial</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Ends {new Date(activeTrial.ends_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' · '}{activeTrial.allowed_model.split('-').slice(0, 2).join(' ')}
              </p>
            </div>
            <button type="button" onClick={revokeTrial} disabled={pending} className="text-[11px] text-red-500 hover:text-red-700 font-medium transition-colors disabled:opacity-50">
              Revoke
            </button>
          </div>
        ) : (
          <>
            {!showTrialForm ? (
              <button type="button" onClick={() => setShowTrialForm(true)} className="text-[11px] text-sky-600 hover:text-sky-800 font-medium transition-colors flex items-center gap-1">
                <RefreshCw size={10} /> Grant free trial
              </button>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Trial Ends</label>
                    <input type="date" value={trialEnd} onChange={e => setTrialEnd(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-300" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Model</label>
                    <select value={trialModel} onChange={e => setTrialModel(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                      {CLAUDE_MODELS.map(m => <option key={m} value={m}>{m.split('-').slice(0, 3).join('-')}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={grantTrial} disabled={pending || !trialEnd} className="flex items-center gap-1 px-2.5 py-1.5 bg-sky-600 text-white text-[11px] font-semibold rounded-lg hover:bg-sky-700 disabled:opacity-50 transition-colors">
                    <Check size={10} /> {pending ? 'Granting…' : 'Grant'}
                  </button>
                  <button type="button" onClick={() => setShowTrialForm(false)} className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors">Cancel</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function BillingManager({ tenantId, initialPlan, initialStatus, activeBots, subs, trials }: Props) {
  const [plan,    setPlan]    = useState<TenantPlan>(initialPlan);
  const [status,  setStatus]  = useState<TenantStatus>(initialStatus);
  const [pending, startTransition] = useTransition();

  function changePlan(p: TenantPlan) {
    if (p === plan) return;
    setPlan(p);
    startTransition(async () => { await updateTenantPlanAction(tenantId, p); });
  }

  function changeStatus(s: TenantStatus) {
    if (s === status) return;
    setStatus(s);
    startTransition(async () => { await updateTenantStatusAction(tenantId, s); });
  }

  const subMap   = new Map<string, SubscriptionRow>(subs.map(s => [s.product_type, s]));
  const trialMap = new Map<string, TrialRow>(trials.map(t => [t.product_slug, t]));

  return (
    <div className="space-y-5">
      {/* Plan selector */}
      <div>
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Plan</p>
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(PLAN_META) as [TenantPlan, typeof PLAN_META[TenantPlan]][]).map(([key, meta]) => (
            <button
              key={key}
              type="button"
              onClick={() => changePlan(key)}
              disabled={pending}
              className={`relative p-3 rounded-xl border text-left transition-all disabled:opacity-60 ${
                plan === key ? `${meta.bg} ${meta.border} ring-1 ${meta.ring}` : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              {plan === key && (
                <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                  <Check size={9} className="text-white" />
                </span>
              )}
              <p className={`text-sm font-bold ${plan === key ? meta.color : 'text-slate-600'}`}>{meta.name}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{meta.bots} bot{meta.bots > 1 ? 's' : ''}</p>
              <p className="text-[10px] text-slate-400">{meta.conversations}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Status selector */}
      <div>
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Account Status</p>
        <div className="flex items-center gap-2 flex-wrap">
          {(Object.entries(STATUS_META) as [TenantStatus, typeof STATUS_META[TenantStatus]][]).map(([key, meta]) => (
            <button
              key={key}
              type="button"
              onClick={() => changeStatus(key)}
              disabled={pending}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all disabled:opacity-60 ${
                status === key ? `${meta.bg} ${meta.text} ${meta.border}` : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {status === key && <Check size={10} />}
              {meta.label}
            </button>
          ))}
        </div>
        {status === 'suspended' && (
          <p className="text-[11px] text-red-500 mt-2">⚠️ Suspended clients cannot send or receive messages.</p>
        )}
      </div>

      {/* Per-bot subscriptions */}
      {activeBots.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CreditCard size={13} className="text-slate-400" />
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Per-Bot Subscriptions</p>
          </div>
          <div className="space-y-2">
            {activeBots.map(bot => (
              <SubscriptionCard
                key={bot.product_type}
                tenantId={tenantId}
                bot={bot}
                sub={subMap.get(bot.product_type) ?? null}
                trial={trialMap.get(bot.product_type) ?? null}
              />
            ))}
          </div>
        </div>
      )}

      {activeBots.length === 0 && (
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <Calendar size={12} /> Assign bots above to configure per-bot subscriptions.
        </p>
      )}
    </div>
  );
}
