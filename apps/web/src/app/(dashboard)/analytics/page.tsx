import { unstable_cache } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { MessageSquare, Zap, TrendingUp, AlertCircle, GitBranch, Target } from 'lucide-react';
import dynamic from 'next/dynamic';
import { getStageFunnelAction } from '@/app/actions/stage-funnel';
import { getOutcomeAnalyticsAction } from '@/app/actions/outcome-analytics';
import { OutcomeBreakdown } from '@/components/dashboard/OutcomeBreakdown';

// Lazy-load Recharts (~200 KB) — not needed for initial paint
const AnalyticsCharts = dynamic(
  () => import('@/components/dashboard/AnalyticsCharts').then((m) => ({ default: m.AnalyticsCharts })),
  {
    loading: () => <div className="h-72 animate-pulse rounded-2xl bg-gray-100" />,
    ssr: false,
  },
);

const ConversationFunnel = dynamic(
  () => import('@/components/dashboard/ConversationFunnel').then((m) => ({ default: m.ConversationFunnel })),
  {
    loading: () => <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />,
    ssr: false,
  },
);

// Cache the 7 DB queries server-side for 5 minutes per tenant.
// Dates are computed inside the cached function so the query windows are
// fixed at cache-fill time — up to 5-minute staleness is fine for analytics.
const getAnalyticsData = unstable_cache(
  async (tenantId: string) => {
    const admin          = getSupabaseAdminClient();
    const sevenDaysAgo   = new Date(Date.now() - 7  * 86400000).toISOString();
    const thirtyDaysAgo  = new Date(Date.now() - 30 * 86400000).toISOString();
    const currentMonth   = new Date().toISOString().slice(0, 7) + '-01'; // "YYYY-MM-01" matches DATE column

    const [
      { count: totalConvs },
      { count: openConvs },
      { count: resolvedConvs },
      { count: escalatedTotal },
      { data: tokenRow },
      { data: weekEvents },
      { data: monthEvents },
    ] = await Promise.all([
      admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open'),
      admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'resolved'),
      admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['escalated']),
      // Single-row aggregate lookup — O(1) vs full usage_events table scan
      admin.from('tenant_token_usage_monthly').select('tokens_used').eq('tenant_id', tenantId).eq('month', currentMonth).maybeSingle(),
      admin.from('usage_events').select('event_type, created_at').eq('tenant_id', tenantId).gte('created_at', sevenDaysAgo),
      admin.from('usage_events').select('event_type, product_type').eq('tenant_id', tenantId).gte('created_at', thirtyDaysAgo),
    ]);

    return { totalConvs, openConvs, resolvedConvs, escalatedTotal, tokenRow, weekEvents, monthEvents };
  },
  ['analytics'],
  { revalidate: 300 },
);

export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const { tenantId } = session;
  const [analyticsData, funnelRows, outcomeRows] = await Promise.all([
    getAnalyticsData(tenantId),
    getStageFunnelAction(tenantId, 30),
    getOutcomeAnalyticsAction(30),
  ]);
  const { totalConvs, openConvs, resolvedConvs, escalatedTotal, tokenRow, weekEvents, monthEvents } = analyticsData;

  // Aggregate totals
  const totalTokens    = (tokenRow as { tokens_used?: number } | null)?.tokens_used ?? 0;
  const totalMessages  = (monthEvents ?? []).filter(e => e.event_type === 'message_sent').length;
  const escalationRate = totalConvs
    ? Math.round(((escalatedTotal ?? 0) / totalConvs) * 100)
    : 0;

  // Daily chart data — last 7 days
  const dailyData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const datePrefix = d.toISOString().slice(0, 10);
    const label      = d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayEvents  = (weekEvents ?? []).filter(e => e.created_at.startsWith(datePrefix));
    return {
      date:          label,
      conversations: dayEvents.filter(e => e.event_type === 'conversation_started').length,
      messages:      dayEvents.filter(e => e.event_type === 'message_sent').length,
    };
  });

  // Product breakdown — last 30 days
  const productMap: Record<string, number> = {};
  (monthEvents ?? [])
    .filter(e => e.event_type === 'message_sent')
    .forEach(e => {
      const key = e.product_type.replace('_bot', '').replace('_', ' ');
      productMap[key] = (productMap[key] ?? 0) + 1;
    });
  const productData = Object.entries(productMap).map(([name, value]) => ({ name, value }));

  const stats = [
    {
      label:      'Total Conversations',
      value:      (totalConvs ?? 0).toLocaleString(),
      sub:        `${openConvs ?? 0} open · ${resolvedConvs ?? 0} resolved`,
      icon:       MessageSquare,
      iconBg:     'bg-emerald-100',
      iconColor:  'text-emerald-600',
      valueColor: 'text-emerald-700',
    },
    {
      label:      'Messages Sent',
      value:      totalMessages.toLocaleString(),
      sub:        'Last 30 days',
      icon:       TrendingUp,
      iconBg:     'bg-sky-100',
      iconColor:  'text-sky-600',
      valueColor: 'text-sky-700',
    },
    {
      label:      'Tokens Used',
      value:      totalTokens.toLocaleString(),
      sub:        'All time (AI responses)',
      icon:       Zap,
      iconBg:     'bg-violet-100',
      iconColor:  'text-violet-600',
      valueColor: 'text-violet-700',
    },
    {
      label:      'Escalation Rate',
      value:      `${escalationRate}%`,
      sub:        `${escalatedTotal ?? 0} escalated of ${totalConvs ?? 0} total`,
      icon:       AlertCircle,
      iconBg:     'bg-red-100',
      iconColor:  'text-red-600',
      valueColor: 'text-red-700',
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Analytics</h2>
        <p className="text-sm text-gray-500 mt-0.5">Usage metrics and conversation insights</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-2xl border border-green-100 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
          >
            <div className={`w-10 h-10 rounded-xl ${s.iconBg} flex items-center justify-center`}>
              <s.icon size={18} className={s.iconColor} />
            </div>
            <div className="mt-4">
              <p className={`text-3xl font-bold tabular-nums ${s.valueColor}`}>{s.value}</p>
              <p className="text-sm font-semibold text-gray-700 mt-1">{s.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <AnalyticsCharts dailyData={dailyData} productData={productData} />

      {/* Stage Funnel */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <GitBranch size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700">Conversation Stage Funnel</h3>
          <span className="text-xs text-gray-400 ml-1">Last 30 days</span>
        </div>
        <ConversationFunnel rows={funnelRows} />
      </div>

      {/* Conversation Outcome Breakdown */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700">Conversation Outcomes</h3>
          <span className="text-xs text-gray-400 ml-1">Last 30 days · AI-classified</span>
        </div>
        <OutcomeBreakdown rows={outcomeRows} />
      </div>
    </div>
  );
}
