import { unstable_cache } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { MessageSquare, Zap, TrendingUp, AlertCircle, GitBranch, Target, BookOpen, HelpCircle, Users, CalendarCheck, BellRing } from 'lucide-react';
import dynamic from 'next/dynamic';
import { getStageFunnelAction } from '@/app/actions/stage-funnel';
import { getOutcomeAnalyticsAction } from '@/app/actions/outcome-analytics';
import { getKBAnalyticsAction } from '@/app/actions/kb-analytics';
import { getFollowupAnalyticsAction } from '@/app/actions/followup-analytics';
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

// Cache is keyed per tenant — each tenant gets its own 5-minute slot.
// Previously keyed only ['analytics'] which caused all tenants to share
// one cache entry (data isolation bug).
function getAnalyticsData(tenantId: string) {
  return unstable_cache(
    async () => {
      const admin          = getSupabaseAdminClient();
      const sevenDaysAgo   = new Date(Date.now() - 7  * 86400000).toISOString();
      const thirtyDaysAgo  = new Date(Date.now() - 30 * 86400000).toISOString();
      const currentMonth   = new Date().toISOString().slice(0, 7) + '-01'; // "YYYY-MM-01" matches DATE column

      const [
        { count: totalConvs },
        { count: openConvs },
        { count: resolvedConvs },
        { count: escalatedTotal },
        { data: activeContactsRow },
        { data: tokenRow },
        { data: weekEvents },
        { data: monthEvents },
      ] = await Promise.all([
        admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open'),
        admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'resolved'),
        admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['escalated']),
        // Distinct contacts active in the last 30 days via RPC
        admin.rpc('count_active_contacts', { p_tenant_id: tenantId, p_days: 30 }),
        // Single-row aggregate lookup — O(1) vs full usage_events table scan
        admin.from('tenant_token_usage_monthly').select('tokens_used').eq('tenant_id', tenantId).eq('month', currentMonth).maybeSingle(),
        admin.from('usage_events').select('event_type, created_at').eq('tenant_id', tenantId).gte('created_at', sevenDaysAgo).limit(10000),
        admin.from('usage_events').select('event_type, product_type').eq('tenant_id', tenantId).gte('created_at', thirtyDaysAgo).limit(10000),
      ]);

      const activeContacts = (activeContactsRow as number | null) ?? 0;
      return { totalConvs, openConvs, resolvedConvs, escalatedTotal, activeContacts, tokenRow, weekEvents, monthEvents };
    },
    ['analytics', tenantId],
    { revalidate: 300, tags: [`analytics:${tenantId}`] },
  )();
}

export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const { tenantId } = session;
  const [analyticsData, funnelRows, outcomeRows, kbData, followupStats] = await Promise.all([
    getAnalyticsData(tenantId),
    getStageFunnelAction(tenantId, 30),
    getOutcomeAnalyticsAction(30),
    getKBAnalyticsAction(30),
    getFollowupAnalyticsAction(30),
  ]);
  const { totalConvs, openConvs, resolvedConvs, escalatedTotal, activeContacts, tokenRow, weekEvents, monthEvents } = analyticsData;

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
      label:      'Active Contacts',
      value:      (activeContacts ?? 0).toLocaleString(),
      sub:        'Conversations last 30 days',
      icon:       Users,
      iconBg:     'bg-teal-100',
      iconColor:  'text-teal-600',
      valueColor: 'text-teal-700',
    },
    {
      label:      'Tokens Used',
      value:      totalTokens.toLocaleString(),
      sub:        'This month (AI responses)',
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
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
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

      {/* ── KB Performance ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700">Knowledge Base Performance</h3>
          <span className="text-xs text-gray-400 ml-1">Last 30 days</span>
        </div>

        {/* KB stat pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-4">
            <p className="text-2xl font-bold tabular-nums text-emerald-700">{kbData.hitCount.toLocaleString()}</p>
            <p className="text-xs font-semibold text-gray-600 mt-1">KB Hits</p>
            <p className="text-xs text-gray-400">Queries answered from KB</p>
          </div>
          <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-4">
            <p className="text-2xl font-bold tabular-nums text-amber-600">{kbData.unansweredCount.toLocaleString()}</p>
            <p className="text-xs font-semibold text-gray-600 mt-1">Unanswered</p>
            <p className="text-xs text-gray-400">Queries KB couldn&apos;t answer</p>
          </div>
          <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-4">
            <p className="text-2xl font-bold tabular-nums text-sky-700">
              {kbData.hitCount + kbData.unansweredCount > 0
                ? `${Math.round((kbData.hitCount / (kbData.hitCount + kbData.unansweredCount)) * 100)}%`
                : '—'}
            </p>
            <p className="text-xs font-semibold text-gray-600 mt-1">KB Coverage</p>
            <p className="text-xs text-gray-400">% of queries answered by KB</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top queries */}
          <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-green-50 flex items-center gap-2">
              <BookOpen size={13} className="text-emerald-500" />
              <span className="text-xs font-semibold text-gray-600">Top Questions Asked</span>
            </div>
            {kbData.topQueries.length === 0 ? (
              <p className="px-5 py-6 text-xs text-gray-400">No KB activity yet in this period.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {kbData.topQueries.map((q, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="text-xs font-bold text-gray-300 tabular-nums w-4 shrink-0">{i + 1}</span>
                    <span className="text-xs text-gray-700 flex-1 truncate" title={q.query}>{q.query}</span>
                    <span className="text-xs font-semibold text-emerald-600 tabular-nums shrink-0">{q.count}×</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Unanswered queries — KB gaps */}
          <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-amber-50 flex items-center gap-2">
              <HelpCircle size={13} className="text-amber-500" />
              <span className="text-xs font-semibold text-gray-600">KB Gaps — Unanswered Queries</span>
              <span className="text-[10px] text-amber-500 ml-auto font-medium">Add these to your KB</span>
            </div>
            {kbData.topUnanswered.length === 0 ? (
              <p className="px-5 py-6 text-xs text-gray-400">No unanswered queries — great KB coverage!</p>
            ) : (
              <ul className="divide-y divide-amber-50/60">
                {kbData.topUnanswered.map((q, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="text-xs font-bold text-gray-300 tabular-nums w-4 shrink-0">{i + 1}</span>
                    <span className="text-xs text-gray-700 flex-1 truncate" title={q.query}>{q.query}</span>
                    <span className="text-xs font-semibold text-amber-500 tabular-nums shrink-0">{q.count}×</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ── Follow-up & Booking Conversion ───────────────────────────────── */}
      {followupStats.total > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CalendarCheck size={15} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Enquiry Follow-up &amp; Booking Conversion</h3>
            <span className="text-xs text-gray-400 ml-1">Last 30 days</span>
          </div>
          <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-2xl font-bold tabular-nums text-gray-800">{followupStats.total.toLocaleString()}</p>
                <p className="text-xs font-semibold text-gray-600 mt-1">Total Enquiries</p>
                <p className="text-xs text-gray-400">Entered follow-up system</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-emerald-600">{followupStats.converted.toLocaleString()}</p>
                <p className="text-xs font-semibold text-gray-600 mt-1">Booked Early</p>
                <p className="text-xs text-gray-400">
                  Booked before nudge
                  {followupStats.total > 0 && (
                    <span className="ml-1 text-emerald-500 font-semibold">
                      ({Math.round((followupStats.converted / followupStats.total) * 100)}%)
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-sky-600">{followupStats.nudged.toLocaleString()}</p>
                <p className="text-xs font-semibold text-gray-600 mt-1 flex items-center gap-1">
                  <BellRing size={11} className="text-sky-400" />
                  Nudged
                </p>
                <p className="text-xs text-gray-400">Follow-up message sent</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-gray-400">{followupStats.pending.toLocaleString()}</p>
                <p className="text-xs font-semibold text-gray-600 mt-1">Pending</p>
                <p className="text-xs text-gray-400">Scheduled, not yet fired</p>
              </div>
            </div>

            {/* Conversion bar */}
            {followupStats.total > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                  <span>Conversion breakdown</span>
                  <span>{followupStats.total} total enquiries</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 flex overflow-hidden">
                  <div
                    className="bg-emerald-400 transition-all"
                    style={{ width: `${(followupStats.converted / followupStats.total) * 100}%` }}
                  />
                  <div
                    className="bg-sky-300 transition-all"
                    style={{ width: `${(followupStats.nudged / followupStats.total) * 100}%` }}
                  />
                  <div
                    className="bg-gray-200 transition-all"
                    style={{ width: `${(followupStats.pending / followupStats.total) * 100}%` }}
                  />
                </div>
                <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Booked early</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-300 inline-block" />Nudged</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200 inline-block" />Pending</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
