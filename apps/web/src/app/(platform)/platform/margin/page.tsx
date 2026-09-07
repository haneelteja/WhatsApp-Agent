import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { TrendingUp, AlertTriangle, IndianRupee } from 'lucide-react';
import Link from 'next/link';

const PLAN_REVENUE: Record<string, number> = {
  starter: 0,
  growth:  2499,
  scale:   4999,
};

const PLAN_STYLE: Record<string, { bg: string; text: string }> = {
  starter: { bg: 'bg-slate-100',   text: 'text-slate-600'  },
  growth:  { bg: 'bg-indigo-50',   text: 'text-indigo-700' },
  scale:   { bg: 'bg-violet-50',   text: 'text-violet-700' },
};

function marginStyle(pct: number | null): { bg: string; text: string } {
  if (pct === null) return { bg: 'bg-slate-50', text: 'text-slate-400' };
  if (pct >= 60)   return { bg: 'bg-emerald-50', text: 'text-emerald-700' };
  if (pct >= 20)   return { bg: 'bg-amber-50',   text: 'text-amber-600'  };
  return               { bg: 'bg-red-50',     text: 'text-red-600'    };
}

export default async function PlatformMarginPage() {
  const admin = getSupabaseAdminClient();

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString().slice(0, 10);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    .toISOString().slice(0, 10);

  const [
    { data: tenants },
    { data: tokenUsage },
    { data: voiceCalls },
  ] = await Promise.all([
    admin.from('tenants')
      .select('id, name, plan, status, subscription_status')
      .order('name'),

    admin.from('tenant_token_usage_monthly')
      .select('tenant_id, tokens_used, cost_inr_month')
      .eq('month', currentMonthStart),

    admin.from('voice_calls')
      .select('tenant_id, cost_rupees')
      .gte('created_at', currentMonthStart)
      .lt('created_at', nextMonthStart),
  ]);

  // Build per-tenant cost maps
  const llmCostMap = new Map<string, number>();
  for (const row of tokenUsage ?? []) {
    llmCostMap.set(row.tenant_id, parseFloat((row.cost_inr_month as string | number | null) as string ?? '0'));
  }

  const voiceCostMap = new Map<string, number>();
  for (const call of voiceCalls ?? []) {
    voiceCostMap.set(
      call.tenant_id,
      (voiceCostMap.get(call.tenant_id) ?? 0) + parseFloat(call.cost_rupees ?? '0'),
    );
  }

  const rows = (tenants ?? []).map(t => {
    const revenue    = PLAN_REVENUE[t.plan] ?? 0;
    const llmCost    = llmCostMap.get(t.id)   ?? 0;
    const voiceCost  = voiceCostMap.get(t.id) ?? 0;
    const totalCost  = llmCost + voiceCost;
    const margin     = revenue - totalCost;
    const marginPct  = revenue > 0 ? (margin / revenue) * 100 : null;
    return { ...t, revenue, llmCost, voiceCost, totalCost, margin, marginPct };
  }).sort((a, b) => b.margin - a.margin);

  const totalRevenue   = rows.reduce((s, t) => s + t.revenue,   0);
  const totalLlmCost   = rows.reduce((s, t) => s + t.llmCost,   0);
  const totalVoiceCost = rows.reduce((s, t) => s + t.voiceCost, 0);
  const totalCost      = totalLlmCost + totalVoiceCost;
  const totalMargin    = totalRevenue - totalCost;
  const platformPct    = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

  const monthLabel = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const KPI = [
    { label: 'Monthly Revenue', value: `₹${totalRevenue.toLocaleString('en-IN')}`,  color: 'text-emerald-700' },
    { label: 'LLM Cost',        value: `₹${totalLlmCost.toFixed(2)}`,               color: 'text-red-600'     },
    { label: 'Voice Cost',      value: `₹${totalVoiceCost.toFixed(2)}`,             color: 'text-amber-600'   },
    {
      label: 'Net Margin',
      value: `₹${Math.abs(totalMargin).toLocaleString('en-IN')}${totalMargin < 0 ? ' loss' : ''}`,
      sub:   `${platformPct.toFixed(1)}% margin`,
      color: totalMargin >= 0 ? 'text-emerald-700' : 'text-red-600',
    },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Margin Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5">Revenue vs. costs per tenant — {monthLabel}</p>
        </div>
        <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5">
          <IndianRupee size={12} className="text-indigo-500" />
          <p className="text-xs font-semibold text-indigo-700">Current month only</p>
        </div>
      </div>

      {/* Platform KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {KPI.map(k => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className={`text-2xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            {k.sub && <p className={`text-sm font-semibold ${k.color} mt-0.5`}>{k.sub}</p>}
            <p className="text-xs text-slate-400 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Per-tenant table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <TrendingUp size={14} className="text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">Per-Tenant Breakdown</p>
          <span className="text-xs text-slate-400 ml-auto">{rows.length} clients</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {['Client', 'Plan', 'Revenue', 'LLM Cost', 'Voice Cost', 'Total Cost', 'Net Margin'].map(h => (
                  <th
                    key={h}
                    className={`px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider ${
                      h === 'Client' || h === 'Plan' ? 'text-left' : 'text-right'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(t => {
                const ms = marginStyle(t.marginPct);
                const plan = PLAN_STYLE[t.plan] ?? PLAN_STYLE.starter;
                return (
                  <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/platform/clients/${t.id}`}
                        className="font-semibold text-slate-800 hover:text-indigo-700 transition-colors"
                      >
                        {t.name}
                      </Link>
                      <p className="text-[10px] text-slate-400 mt-0.5 capitalize">
                        {t.status}
                        {t.subscription_status === 'cancelled' ? ' · cancelled' : ''}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${plan.bg} ${plan.text}`}>
                        {t.plan}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-slate-700">
                      ₹{t.revenue.toLocaleString('en-IN')}
                    </td>
                    <td className="px-5 py-3.5 text-right text-red-600">
                      ₹{t.llmCost.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 text-right text-amber-600">
                      ₹{t.voiceCost.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 text-right text-slate-600">
                      ₹{t.totalCost.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${ms.bg} ${ms.text}`}>
                        {t.marginPct !== null ? `${t.marginPct.toFixed(0)}%` : '—'}
                        <span className="font-normal opacity-75 text-[10px]">
                          {t.margin >= 0
                            ? `₹${t.margin.toLocaleString('en-IN')}`
                            : `−₹${Math.abs(t.margin).toLocaleString('en-IN')}`}
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50/80">
                <tr>
                  <td className="px-5 py-3 font-bold text-slate-700" colSpan={2}>Total</td>
                  <td className="px-5 py-3 text-right font-bold text-emerald-700">₹{totalRevenue.toLocaleString('en-IN')}</td>
                  <td className="px-5 py-3 text-right font-bold text-red-600">₹{totalLlmCost.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right font-bold text-amber-600">₹{totalVoiceCost.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right font-bold text-slate-600">₹{totalCost.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${marginStyle(platformPct).bg} ${marginStyle(platformPct).text}`}>
                      {platformPct.toFixed(0)}%
                      <span className="font-normal opacity-75 text-[10px]">
                        {totalMargin >= 0 ? `₹${totalMargin.toLocaleString('en-IN')}` : `−₹${Math.abs(totalMargin).toLocaleString('en-IN')}`}
                      </span>
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
          {rows.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-12">No tenants yet.</p>
          )}
        </div>
      </div>

      {/* Caveat note */}
      <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-500" />
        <p>
          Revenue is based on plan tier only (Starter ₹0, Growth ₹2,499, Scale ₹4,999).
          Costs are current calendar month: LLM costs from <code className="font-mono bg-amber-100 px-1 rounded">tenant_token_usage_monthly</code>,
          voice from <code className="font-mono bg-amber-100 px-1 rounded">voice_calls.cost_rupees</code>.
          Starter clients show no revenue and inflate the loss figure — filter them if needed.
        </p>
      </div>
    </div>
  );
}
