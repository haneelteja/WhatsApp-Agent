import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { CreditCard, AlertTriangle, Clock } from 'lucide-react';

const PLAN_BADGE: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-600 ring-slate-200',
  growth:  'bg-violet-50 text-violet-700 ring-violet-200',
  scale:   'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

const STATUS_BADGE: Record<string, string> = {
  active:    'bg-emerald-50 text-emerald-700 ring-emerald-200',
  trial:     'bg-sky-50 text-sky-700 ring-sky-200',
  suspended: 'bg-red-50 text-red-700 ring-red-200',
};

type SearchParams = Promise<{ status?: string }>;

export default async function PlatformBillingPage({ searchParams }: { searchParams: SearchParams }) {
  const { status: filterStatus } = await searchParams;
  const admin = getSupabaseAdminClient();

  const [
    { data: tenants },
    { data: subscriptions },
    { data: trials },
    { data: products },
  ] = await Promise.all([
    admin.from('tenants').select('id, name, plan, status, created_at').order('created_at', { ascending: false }),
    admin.from('subscriptions').select('tenant_id, product_type, tier, billing_cycle, next_billing_date'),
    admin.from('free_trials').select('tenant_id, product_slug, ends_at, status').eq('status', 'active'),
    admin.from('tenant_products').select('tenant_id, product_type, active').eq('active', true),
  ]);

  const subsMap   = new Map<string, typeof subscriptions>(); // keyed by tenant_id
  for (const s of subscriptions ?? []) {
    const list = subsMap.get(s.tenant_id) ?? [];
    list.push(s);
    subsMap.set(s.tenant_id, list);
  }

  const trialsMap  = new Map<string, typeof trials>();
  for (const t of trials ?? []) {
    const list = trialsMap.get(t.tenant_id) ?? [];
    list.push(t);
    trialsMap.set(t.tenant_id, list);
  }

  const botsMap = new Map<string, number>(); // tenant_id → active bot count
  for (const p of products ?? []) {
    botsMap.set(p.tenant_id, (botsMap.get(p.tenant_id) ?? 0) + 1);
  }

  const STATUSES = ['all', 'active', 'trial', 'suspended'] as const;

  const filtered = (tenants ?? []).filter(t =>
    !filterStatus || filterStatus === 'all' ? true : t.status === filterStatus
  );

  // Tenants with trials expiring within 7 days
  const now = Date.now();
  const expiringTenants = (tenants ?? []).filter(t => {
    const tList = trialsMap.get(t.id) ?? [];
    return tList.some(tr => {
      const daysLeft = (new Date(tr.ends_at).getTime() - now) / 86400000;
      return daysLeft >= 0 && daysLeft <= 7;
    });
  });

  // Revenue summary (plan counts)
  const planCounts = { starter: 0, growth: 0, scale: 0 };
  for (const t of tenants ?? []) {
    if (t.status === 'active') planCounts[t.plan as keyof typeof planCounts]++;
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Billing Overview</h2>
        <p className="text-sm text-slate-500 mt-0.5">Subscription and plan status across all clients</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Clients',  value: String(tenants?.length ?? 0),     color: 'text-slate-700'   },
          { label: 'Active',         value: String(planCounts.starter + planCounts.growth + planCounts.scale), color: 'text-emerald-700' },
          { label: 'On Trial',       value: String((tenants ?? []).filter(t => t.status === 'trial').length),  color: 'text-sky-700'     },
          { label: 'Suspended',      value: String((tenants ?? []).filter(t => t.status === 'suspended').length), color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-xs font-medium text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Expiring trials alert */}
      {expiringTenants.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Trials expiring within 7 days</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {expiringTenants.map(t => t.name).join(', ')} — follow up to convert to paid plans.
            </p>
          </div>
        </div>
      )}

      {/* Plan distribution */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">Active Plan Distribution</p>
        <div className="grid grid-cols-3 gap-3">
          {(['starter', 'growth', 'scale'] as const).map(p => (
            <div key={p} className={`rounded-xl border p-3 ${PLAN_BADGE[p].replace('ring-', 'border-').replace('ring', 'border')}`}>
              <p className="text-lg font-bold tabular-nums text-slate-800">{planCounts[p]}</p>
              <p className="text-xs font-medium text-slate-500 capitalize">{p}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUSES.map(s => (
          <Link
            key={s}
            href={s === 'all' ? '/platform/billing' : `/platform/billing?status=${s}`}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors capitalize ${
              (s === 'all' && !filterStatus) || filterStatus === s
                ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {s}
          </Link>
        ))}
        <span className="text-xs text-slate-400 ml-1">{filtered.length} clients</span>
      </div>

      {/* Clients table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-12">No clients match this filter.</p>
          ) : filtered.map(t => {
            const tSubs   = subsMap.get(t.id) ?? [];
            const tTrials = trialsMap.get(t.id) ?? [];
            const botCount = botsMap.get(t.id) ?? 0;
            const activeTrial = tTrials[0];
            const nextBillDates = tSubs.map(s => s.next_billing_date).filter(Boolean).sort();
            const nextBill = nextBillDates[0];

            return (
              <Link
                key={t.id}
                href={`/platform/clients/${t.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors">{t.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{botCount} active bot{botCount !== 1 ? 's' : ''}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {activeTrial && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-sky-600 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5">
                      <Clock size={9} />
                      Trial · {Math.ceil((new Date(activeTrial.ends_at).getTime() - now) / 86400000)}d
                    </span>
                  )}
                  {nextBill && (
                    <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
                      Next: {new Date(nextBill).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 capitalize ${PLAN_BADGE[t.plan] ?? PLAN_BADGE.starter}`}>
                    {t.plan}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 capitalize ${STATUS_BADGE[t.status] ?? STATUS_BADGE.active}`}>
                    {t.status}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
