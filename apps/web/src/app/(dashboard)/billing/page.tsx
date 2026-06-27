import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { CreditCard, Check, Clock, MessageSquare, Bot, AlertCircle, Zap } from 'lucide-react';

const PLAN_META = {
  starter: {
    name: 'Starter',
    color: 'text-slate-700',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    bots: 1,
    conversations: '500',
    features: [
      '1 active bot',
      '500 conversations / month',
      'Standard guardrails',
      'Knowledge base',
      'Auto follow-ups',
      'Email support',
    ],
  },
  growth: {
    name: 'Growth',
    color: 'text-violet-700',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    badgeBg: 'bg-violet-100',
    badgeText: 'text-violet-700',
    bots: 2,
    conversations: '2,000',
    features: [
      '2 active bots',
      '2,000 conversations / month',
      'Advanced guardrails',
      'Knowledge base',
      'Customer sentiment',
      'Auto follow-ups',
      'Analytics',
      'Priority support',
    ],
  },
  scale: {
    name: 'Scale',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-700',
    bots: 3,
    conversations: 'Unlimited',
    features: [
      'All 3 bots',
      'Unlimited conversations',
      'Full guardrails suite',
      'Knowledge base',
      'Customer sentiment',
      'Auto follow-ups',
      'Advanced analytics',
      'Dedicated support',
    ],
  },
} as const;

type PlanKey = keyof typeof PLAN_META;

const PLAN_TOKEN_LIMITS: Record<PlanKey, number> = {
  starter:  2_000_000,
  growth:  10_000_000,
  scale:   Infinity,
};

function formatTokens(n: number): string {
  if (!isFinite(n)) return '∞';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

const BOT_META: Record<string, { name: string; color: string; bg: string; border: string }> = {
  support_bot:   { name: 'Support Bot',   color: 'text-sky-600',    bg: 'bg-sky-50',    border: 'border-sky-200'    },
  sales_bot:     { name: 'Sales Bot',     color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
  lifecycle_bot: { name: 'Lifecycle Bot', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
};

export default async function BillingPage() {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  const tenantId = tenantUser?.tenant_id ?? '';

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthDate  = monthStart.toISOString().slice(0, 7) + '-01'; // e.g. "2026-06-01"

  const [
    { data: tenant },
    { data: products },
    { data: subs },
    { data: trials },
    { count: convThisMonth },
    { data: tokenRow },
  ] = await Promise.all([
    admin.from('tenants').select('name, plan, status').eq('id', tenantId).single(),
    admin.from('tenant_products').select('product_type, active').eq('tenant_id', tenantId).eq('active', true),
    admin.from('subscriptions').select('product_type, tier, billing_cycle, next_billing_date').eq('tenant_id', tenantId),
    admin.from('free_trials').select('product_slug, ends_at, status, allowed_model').eq('tenant_id', tenantId).eq('status', 'active'),
    admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)
      .gte('created_at', monthStart.toISOString()),
    admin.from('tenant_token_usage_monthly').select('tokens_used').eq('tenant_id', tenantId).eq('month', monthDate).maybeSingle(),
  ]);

  const plan = (tenant?.plan as PlanKey) ?? 'starter';
  const meta = PLAN_META[plan] ?? PLAN_META.starter;

  const subMap   = new Map((subs ?? []).map(s => [s.product_type, s]));
  const trialMap = new Map((trials ?? []).map(t => [t.product_slug, t]));

  const activeBots = (products ?? []).filter(p => p.active);
  const activeTrial = trials?.[0] ?? null;

  const now = Date.now();

  const PLAN_LIMIT_NUM: Record<PlanKey, number> = { starter: 500, growth: 2000, scale: Infinity };
  const planLimitNum  = PLAN_LIMIT_NUM[plan];
  const usagePercent  = isFinite(planLimitNum) ? Math.round(((convThisMonth ?? 0) / planLimitNum) * 100) : 0;
  const isOverLimit   = isFinite(planLimitNum) && (convThisMonth ?? 0) >= planLimitNum;
  const isNearLimit   = !isOverLimit && usagePercent >= 80;
  const isSuspended   = tenant?.status === 'suspended';

  const tokensUsed     = tokenRow?.tokens_used ?? 0;
  const planTokenLimit = PLAN_TOKEN_LIMITS[plan];
  const tokenPercent   = isFinite(planTokenLimit) ? Math.round((tokensUsed / planTokenLimit) * 100) : 0;
  const tokenOverLimit = isFinite(planTokenLimit) && tokensUsed >= planTokenLimit;
  const tokenNearLimit = !tokenOverLimit && tokenPercent >= 80;

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Billing & Plan</h2>
        <p className="text-sm text-gray-500 mt-0.5">Your current subscription and usage.</p>
      </div>

      {/* Suspended banner */}
      {isSuspended && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Account suspended</p>
            <p className="text-xs text-red-600 mt-0.5">
              Your bot has stopped replying to messages. Contact your Alphabot account manager to restore access.
            </p>
          </div>
        </div>
      )}

      {/* Limit reached banner */}
      {!isSuspended && isOverLimit && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Monthly conversation limit reached</p>
            <p className="text-xs text-red-600 mt-0.5">
              Your bot has paused replies for this month ({convThisMonth ?? 0}/{planLimitNum} conversations used).
              Contact your account manager to upgrade your plan.
            </p>
          </div>
        </div>
      )}

      {/* Approaching limit banner */}
      {!isSuspended && isNearLimit && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Approaching conversation limit</p>
            <p className="text-xs text-amber-600 mt-0.5">
              You&apos;ve used {usagePercent}% of your monthly limit ({convThisMonth ?? 0}/{planLimitNum} conversations).
              Contact your account manager before your bot pauses.
            </p>
          </div>
        </div>
      )}

      {/* Active trial banner */}
      {activeTrial && (
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-start gap-3">
          <Clock size={16} className="text-sky-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-sky-800">Free Trial Active</p>
            <p className="text-xs text-sky-600 mt-0.5">
              Your trial ends on {new Date(activeTrial.ends_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              {' '}({Math.ceil((new Date(activeTrial.ends_at).getTime() - now) / 86400000)} days remaining).
              Contact your account manager to continue after your trial.
            </p>
          </div>
        </div>
      )}

      {/* Current plan card */}
      <div className={`rounded-2xl border p-6 ${meta.bg} ${meta.border}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <p className={`text-2xl font-bold ${meta.color}`}>{meta.name}</p>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.badgeBg} ${meta.badgeText} capitalize`}>
                {tenant?.status ?? 'active'}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">Current plan</p>
          </div>
          <CreditCard size={24} className={`${meta.color} opacity-40`} />
        </div>

        <ul className="space-y-1.5 mb-4">
          {meta.features.map(f => (
            <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
              <Check size={13} className={meta.color} />
              {f}
            </li>
          ))}
        </ul>

        <p className="text-xs text-slate-500 border-t border-slate-200 pt-3 mt-3">
          To upgrade your plan or adjust your subscription, contact your Alphabot account manager.
        </p>
      </div>

      {/* Usage this month */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Conversations */}
        <div className="bg-white border border-green-100 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare size={14} className="text-emerald-500" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Conversations</p>
          </div>
          <p className="text-2xl font-bold text-slate-800 tabular-nums">{convThisMonth ?? 0}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            This month · limit: {meta.conversations === 'Unlimited' ? '∞' : meta.conversations}
          </p>
          {isFinite(planLimitNum) && (
            <div className="mt-2">
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    isOverLimit ? 'bg-red-500' : isNearLimit ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">{usagePercent}% used</p>
            </div>
          )}
        </div>

        {/* AI Tokens */}
        <div className="bg-white border border-green-100 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={14} className="text-emerald-500" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">AI Tokens</p>
          </div>
          <p className="text-2xl font-bold text-slate-800 tabular-nums">{formatTokens(tokensUsed)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            This month · limit: {formatTokens(planTokenLimit)}
          </p>
          {isFinite(planTokenLimit) && (
            <div className="mt-2">
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    tokenOverLimit ? 'bg-red-500' : tokenNearLimit ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(tokenPercent, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">{tokenPercent}% used</p>
            </div>
          )}
        </div>

        {/* Active Bots */}
        <div className="bg-white border border-green-100 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Bot size={14} className="text-emerald-500" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Active Bots</p>
          </div>
          <p className="text-2xl font-bold text-slate-800 tabular-nums">{activeBots.length}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">of {meta.bots} on {meta.name}</p>
        </div>
      </div>

      {/* Per-bot subscriptions */}
      {activeBots.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">Bot Subscriptions</p>
          {activeBots.map(p => {
            const botMeta = BOT_META[p.product_type];
            const sub     = subMap.get(p.product_type);
            const trial   = trialMap.get(p.product_type);

            return (
              <div key={p.product_type} className={`rounded-xl border p-4 ${botMeta?.bg ?? 'bg-slate-50'} ${botMeta?.border ?? 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-sm font-semibold ${botMeta?.color ?? 'text-slate-700'}`}>{botMeta?.name ?? p.product_type}</p>
                  {trial ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 bg-sky-100 text-sky-700 rounded-full">Trial</span>
                  ) : (
                    <span className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">Active</span>
                  )}
                </div>
                {trial ? (
                  <p className="text-xs text-slate-500">
                    Trial ends {new Date(trial.ends_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {' · '}{trial.allowed_model.split('-').slice(0, 3).join('-')}
                  </p>
                ) : sub ? (
                  <div className="grid grid-cols-3 gap-2 text-xs text-slate-500">
                    <span><span className="font-medium text-slate-700 capitalize">{sub.tier ?? plan}</span> tier</span>
                    <span><span className="font-medium text-slate-700 capitalize">{sub.billing_cycle ?? 'Monthly'}</span></span>
                    {sub.next_billing_date && (
                      <span>Due {new Date(sub.next_billing_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Subscription details not yet configured.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
