import { getSupabaseServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { MessageSquare, AlertCircle, CheckCircle2, Bot, ArrowRight, TrendingUp } from 'lucide-react';

const STATUS_STYLES: Record<string, { dot: string; badge: string }> = {
  open:       { dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  escalated:  { dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700 ring-red-100' },
  resolved:   { dot: 'bg-slate-300',   badge: 'bg-slate-100 text-slate-500 ring-slate-200' },
  bot_paused: { dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-amber-100' },
};

const PRODUCT_LABELS: Record<string, { label: string; color: string }> = {
  support_bot:   { label: 'Support',   color: 'bg-blue-50 text-blue-600' },
  sales_bot:     { label: 'Sales',     color: 'bg-violet-50 text-violet-600' },
  lifecycle_bot: { label: 'Lifecycle', color: 'bg-orange-50 text-orange-600' },
};

export default async function DashboardPage() {
  const supabase = await getSupabaseServerClient();

  const [
    { count: openCount },
    { count: escalationCount },
    { count: resolvedCount },
    { count: totalCount },
    { data: recent },
  ] = await Promise.all([
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'escalated'),
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'resolved'),
    supabase.from('conversations').select('*', { count: 'exact', head: true }),
    supabase
      .from('conversations')
      .select('id, status, product_type, updated_at, contacts(name, phone)')
      .order('updated_at', { ascending: false })
      .limit(8),
  ]);

  const stats = [
    {
      label: 'Open Conversations',
      value: openCount ?? 0,
      sub: 'Bot is handling',
      icon: MessageSquare,
      gradient: 'from-emerald-500 to-emerald-600',
      glow: 'shadow-emerald-200',
      bg: 'bg-emerald-50',
      text: 'text-emerald-600',
    },
    {
      label: 'Pending Escalations',
      value: escalationCount ?? 0,
      sub: 'Need agent attention',
      icon: AlertCircle,
      gradient: 'from-red-500 to-rose-600',
      glow: 'shadow-red-200',
      bg: 'bg-red-50',
      text: 'text-red-600',
    },
    {
      label: 'Resolved',
      value: resolvedCount ?? 0,
      sub: 'All time',
      icon: CheckCircle2,
      gradient: 'from-blue-500 to-blue-600',
      glow: 'shadow-blue-200',
      bg: 'bg-blue-50',
      text: 'text-blue-600',
    },
    {
      label: 'Total Conversations',
      value: totalCount ?? 0,
      sub: '3 bots active',
      icon: Bot,
      gradient: 'from-violet-500 to-purple-600',
      glow: 'shadow-violet-200',
      bg: 'bg-violet-50',
      text: 'text-violet-600',
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5">Monitor your WhatsApp AI agents in real time</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between">
              <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
                <s.icon size={18} className={s.text} />
              </div>
              <TrendingUp size={14} className="text-slate-300 mt-1" />
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold text-slate-900 tabular-nums">{s.value}</p>
              <p className="text-sm font-medium text-slate-700 mt-1">{s.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Conversations */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Recent Conversations</h3>
            <p className="text-xs text-slate-400 mt-0.5">Latest activity across all bots</p>
          </div>
          <Link
            href="/conversations"
            className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-semibold transition-colors bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg"
          >
            View all <ArrowRight size={12} />
          </Link>
        </div>

        {!recent?.length ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
              <MessageSquare size={24} className="text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-600">No conversations yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Send a WhatsApp message to your bot number to see conversations appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {recent.map((conv) => {
              const contact = (conv.contacts as unknown) as { name: string | null; phone: string } | null;
              const displayName = contact?.name ?? contact?.phone ?? 'Unknown';
              const style = STATUS_STYLES[conv.status] ?? STATUS_STYLES.resolved;
              const product = PRODUCT_LABELS[conv.product_type];
              const updatedAt = new Date(conv.updated_at);
              const now = new Date();
              const diffMins = Math.floor((now.getTime() - updatedAt.getTime()) / 60000);
              const timeAgo =
                diffMins < 1    ? 'Just now' :
                diffMins < 60   ? `${diffMins}m ago` :
                diffMins < 1440 ? `${Math.floor(diffMins / 60)}h ago` :
                `${Math.floor(diffMins / 1440)}d ago`;

              const initials = displayName.slice(0, 2).toUpperCase();
              const colors = ['bg-emerald-100 text-emerald-700', 'bg-blue-100 text-blue-700', 'bg-violet-100 text-violet-700', 'bg-orange-100 text-orange-700'];
              const colorIdx = displayName.charCodeAt(0) % colors.length;

              return (
                <Link
                  key={conv.id}
                  href={`/conversations/${conv.id}`}
                  className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50/80 transition-colors group"
                >
                  <div className={`w-9 h-9 rounded-full ${colors[colorIdx]} flex items-center justify-center font-bold text-xs shrink-0`}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-emerald-700 transition-colors">
                      {displayName}
                    </p>
                    {product && (
                      <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5 ${product.color}`}>
                        {product.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ring-1 ${style.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      {conv.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-slate-400 w-14 text-right tabular-nums">{timeAgo}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
