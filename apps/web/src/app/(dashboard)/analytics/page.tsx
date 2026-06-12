import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { MessageSquare, Zap, TrendingUp, AlertCircle } from 'lucide-react';
import { AnalyticsCharts } from '@/components/dashboard/AnalyticsCharts';

export default async function AnalyticsPage() {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  const tenantId     = tenantUser?.tenant_id ?? '';
  const sevenDaysAgo  = new Date(Date.now() - 7  * 86400000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const [
    { count: totalConvs },
    { count: openConvs },
    { count: resolvedConvs },
    { count: escalatedTotal },
    { data: tokenEvents },
    { data: weekEvents },
    { data: monthEvents },
  ] = await Promise.all([
    admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open'),
    admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'resolved'),
    admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['escalated']),
    admin.from('usage_events').select('token_count').eq('tenant_id', tenantId).eq('event_type', 'ai_token_used'),
    admin.from('usage_events').select('event_type, created_at').eq('tenant_id', tenantId).gte('created_at', sevenDaysAgo),
    admin.from('usage_events').select('event_type, product_type').eq('tenant_id', tenantId).gte('created_at', thirtyDaysAgo),
  ]);

  // Aggregate totals
  const totalTokens   = (tokenEvents ?? []).reduce((s, e) => s + (e.token_count ?? 0), 0);
  const totalMessages = (monthEvents ?? []).filter(e => e.event_type === 'message_sent').length;
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
    </div>
  );
}
