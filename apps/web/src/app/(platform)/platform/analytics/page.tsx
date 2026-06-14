import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  MessageSquare,
  Bot,
  AlertCircle,
  Users,
  TrendingUp,
  BarChart2,
} from 'lucide-react';
import Link from 'next/link';

const BOT_META: Record<string, { name: string; color: string; bg: string; border: string }> = {
  support_bot:   { name: 'Support Bot',   color: 'text-sky-600',    bg: 'bg-sky-50',    border: 'border-sky-200'    },
  sales_bot:     { name: 'Sales Bot',     color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
  lifecycle_bot: { name: 'Lifecycle Bot', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
};

const STATUS_BADGE: Record<string, string> = {
  open:       'bg-emerald-50 text-emerald-700 ring-emerald-200',
  escalated:  'bg-red-50 text-red-700 ring-red-200',
  resolved:   'bg-slate-100 text-slate-600 ring-slate-200',
  bot_paused: 'bg-amber-50 text-amber-700 ring-amber-200',
};

type SearchParams = Promise<{ range?: string }>;

function startOfPeriod(range: string): string {
  const now = new Date();
  if (range === '7d')  { now.setDate(now.getDate() - 7); return now.toISOString(); }
  if (range === '90d') { now.setDate(now.getDate() - 90); return now.toISOString(); }
  // 30d default
  now.setDate(now.getDate() - 30);
  return now.toISOString();
}

function fmtNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default async function PlatformAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const { range = '30d' } = await searchParams;
  const since = startOfPeriod(range);

  const admin = getSupabaseAdminClient();

  const [
    { data: tenants },
    { count: totalConvs },
    { count: openConvs },
    { count: escalatedConvs },
    { count: resolvedConvs },
    { count: totalMessages },
    { count: userMessages },
    { count: totalEscalations },
    { count: pendingEscalations },
    { data: convsByBot },
    { data: recentConvs },
    { count: contacts },
  ] = await Promise.all([
    admin.from('tenants').select('id, name, plan, status'),

    admin.from('conversations').select('*', { count: 'exact', head: true })
      .gte('created_at', since),

    admin.from('conversations').select('*', { count: 'exact', head: true })
      .eq('status', 'open').gte('created_at', since),

    admin.from('conversations').select('*', { count: 'exact', head: true })
      .eq('status', 'escalated').gte('created_at', since),

    admin.from('conversations').select('*', { count: 'exact', head: true })
      .eq('status', 'resolved').gte('created_at', since),

    admin.from('messages').select('*', { count: 'exact', head: true })
      .gte('timestamp', since),

    admin.from('messages').select('*', { count: 'exact', head: true })
      .eq('role', 'user').gte('timestamp', since),

    admin.from('escalations').select('*', { count: 'exact', head: true })
      .gte('created_at', since),

    admin.from('escalations').select('*', { count: 'exact', head: true })
      .eq('status', 'pending').gte('created_at', since),

    // Conversations grouped by product_type — fetch all and aggregate in JS
    admin.from('conversations').select('product_type, tenant_id')
      .gte('created_at', since),

    // Recent active conversations with tenant name
    admin.from('conversations')
      .select('id, product_type, status, created_at, tenant_id, tenants(name)')
      .order('created_at', { ascending: false })
      .limit(10),

    // Unique contacts (distinct)
    admin.from('contacts').select('tenant_id', { count: 'exact', head: true }),
  ]);

  // Aggregate by bot type
  const botCounts: Record<string, number> = {};
  for (const c of convsByBot ?? []) {
    botCounts[c.product_type] = (botCounts[c.product_type] ?? 0) + 1;
  }

  // Aggregate conversations per tenant
  const tenantConvCounts: Record<string, number> = {};
  for (const c of convsByBot ?? []) {
    tenantConvCounts[c.tenant_id] = (tenantConvCounts[c.tenant_id] ?? 0) + 1;
  }

  const tenantList = (tenants ?? [])
    .map(t => ({ ...t, convCount: tenantConvCounts[t.id] ?? 0 }))
    .sort((a, b) => b.convCount - a.convCount);

  const resolutionRate = totalConvs
    ? Math.round(((resolvedConvs ?? 0) / (totalConvs ?? 1)) * 100)
    : 0;

  const escalationRate = totalConvs
    ? Math.round(((totalEscalations ?? 0) / (totalConvs ?? 1)) * 100)
    : 0;

  const RANGES = [
    { label: '7 days',  value: '7d'  },
    { label: '30 days', value: '30d' },
    { label: '90 days', value: '90d' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Platform Analytics</h2>
          <p className="text-sm text-slate-500 mt-0.5">Aggregate metrics across all tenants</p>
        </div>
        {/* Range selector */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {RANGES.map(r => (
            <Link
              key={r.value}
              href={`/platform/analytics?range=${r.value}`}
              className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                range === r.value
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Top-line KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Conversations',  value: fmtNum(totalConvs ?? 0),    icon: MessageSquare, color: 'text-indigo-600', bg: 'bg-indigo-50'  },
          { label: 'Messages',       value: fmtNum(totalMessages ?? 0),  icon: TrendingUp,    color: 'text-emerald-600',bg: 'bg-emerald-50' },
          { label: 'Escalations',    value: fmtNum(totalEscalations ?? 0), icon: AlertCircle, color: 'text-red-500',   bg: 'bg-red-50'    },
          { label: 'Total Contacts', value: fmtNum(contacts ?? 0),       icon: Users,         color: 'text-violet-600',bg: 'bg-violet-50'  },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center mb-2`}>
              <s.icon size={15} className={s.color} />
            </div>
            <p className="text-2xl font-bold tabular-nums text-slate-800">{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Health metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Open',         value: fmtNum(openConvs ?? 0),      sub: 'conversations', color: 'text-emerald-700' },
          { label: 'Escalated',    value: fmtNum(escalatedConvs ?? 0),  sub: 'conversations', color: 'text-red-600'     },
          { label: 'Resolution',   value: `${resolutionRate}%`,          sub: 'rate',          color: 'text-indigo-600'  },
          { label: 'Escalation',   value: `${escalationRate}%`,          sub: 'rate',          color: 'text-amber-600'   },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{s.label}</p>
            <p className="text-[10px] text-slate-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Two-col: Bot breakdown + Pending escalations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Bot breakdown */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bot size={14} className="text-slate-400" />
            <p className="text-sm font-semibold text-slate-700">Conversations by Bot</p>
          </div>
          <div className="space-y-2.5">
            {Object.entries(BOT_META).map(([slug, meta]) => {
              const count = botCounts[slug] ?? 0;
              const pct   = totalConvs ? Math.round((count / (totalConvs ?? 1)) * 100) : 0;
              return (
                <div key={slug}>
                  <div className="flex items-center justify-between mb-1">
                    <p className={`text-xs font-medium ${meta.color}`}>{meta.name}</p>
                    <p className="text-xs font-semibold text-slate-700 tabular-nums">{fmtNum(count)} <span className="text-slate-400 font-normal">({pct}%)</span></p>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${meta.bg.replace('bg-', 'bg-').replace('-50', '-400')}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {(totalConvs ?? 0) === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">No conversations in this period.</p>
            )}
          </div>
        </div>

        {/* Escalation summary */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle size={14} className="text-slate-400" />
            <p className="text-sm font-semibold text-slate-700">Escalations</p>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Total',    value: totalEscalations ?? 0,   color: 'text-slate-800' },
              { label: 'Pending',  value: pendingEscalations ?? 0, color: 'text-red-600'   },
              { label: 'Resolved', value: (totalEscalations ?? 0) - (pendingEscalations ?? 0), color: 'text-emerald-700' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <p className="text-xs text-slate-500">{row.label}</p>
                <p className={`text-sm font-bold tabular-nums ${row.color}`}>{fmtNum(row.value)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between py-2">
              <p className="text-xs text-slate-500">Avg messages / conv.</p>
              <p className="text-sm font-bold tabular-nums text-slate-800">
                {totalConvs ? ((totalMessages ?? 0) / totalConvs).toFixed(1) : '—'}
              </p>
            </div>
            <div className="flex items-center justify-between py-2">
              <p className="text-xs text-slate-500">User messages</p>
              <p className="text-sm font-bold tabular-nums text-slate-800">{fmtNum(userMessages ?? 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tenant leaderboard */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <BarChart2 size={14} className="text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">Top Clients by Conversations</p>
          <span className="text-xs text-slate-400 ml-auto">{RANGES.find(r => r.value === range)?.label}</span>
        </div>
        <div className="divide-y divide-slate-100">
          {tenantList.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No data yet.</p>
          ) : tenantList.map((t, i) => (
            <Link
              key={t.id}
              href={`/platform/clients/${t.id}`}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors group"
            >
              <span className="text-xs font-bold text-slate-400 w-5 tabular-nums">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors truncate">{t.name}</p>
                <p className="text-[10px] text-slate-400 capitalize">{t.plan} · {t.status}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-400 rounded-full"
                    style={{ width: tenantList[0].convCount ? `${(t.convCount / tenantList[0].convCount) * 100}%` : '0%' }}
                  />
                </div>
                <p className="text-xs font-bold text-slate-700 tabular-nums w-8 text-right">{fmtNum(t.convCount)}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent conversations */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <MessageSquare size={14} className="text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">Recent Conversations</p>
        </div>
        <div className="divide-y divide-slate-100">
          {(recentConvs ?? []).length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No conversations yet.</p>
          ) : (recentConvs ?? []).map(c => {
            const tenant = (c.tenants as unknown as { name: string } | null);
            const botMeta = BOT_META[c.product_type];
            return (
              <div key={c.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${botMeta?.bg ?? 'bg-slate-50'} ${botMeta?.color ?? 'text-slate-600'} border ${botMeta?.border ?? 'border-slate-200'}`}>
                  {botMeta?.name ?? c.product_type}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{tenant?.name ?? '—'}</p>
                  <p className="text-[10px] text-slate-400">{new Date(c.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 capitalize ${STATUS_BADGE[c.status] ?? STATUS_BADGE.open}`}>
                  {c.status.replace('_', ' ')}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
