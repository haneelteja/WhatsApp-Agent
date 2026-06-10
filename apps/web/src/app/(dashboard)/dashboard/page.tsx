import { getSupabaseServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { MessageSquare, AlertCircle, CheckCircle2, Bot, ArrowRight } from 'lucide-react';

const STATUS_STYLES: Record<string, { dot: string; badge: string }> = {
  open:       { dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700' },
  escalated:  { dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700' },
  resolved:   { dot: 'bg-slate-300',   badge: 'bg-slate-100 text-slate-500' },
  bot_paused: { dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700' },
};

const PRODUCT_LABELS: Record<string, string> = {
  support_bot:   'Support',
  sales_bot:     'Sales',
  lifecycle_bot: 'Lifecycle',
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
      .limit(6),
  ]);

  const stats = [
    {
      label: 'Open Conversations',
      value: openCount ?? 0,
      sub: 'Bot is handling',
      icon: MessageSquare,
      iconBg: 'bg-emerald-500',
      iconShadow: 'shadow-emerald-200',
    },
    {
      label: 'Pending Escalations',
      value: escalationCount ?? 0,
      sub: 'Need agent attention',
      icon: AlertCircle,
      iconBg: 'bg-red-500',
      iconShadow: 'shadow-red-200',
    },
    {
      label: 'Resolved',
      value: resolvedCount ?? 0,
      sub: 'All time',
      icon: CheckCircle2,
      iconBg: 'bg-blue-500',
      iconShadow: 'shadow-blue-200',
    },
    {
      label: 'Total Conversations',
      value: totalCount ?? 0,
      sub: '3 bots active',
      icon: Bot,
      iconBg: 'bg-violet-500',
      iconShadow: 'shadow-violet-200',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start justify-between hover:shadow-md transition-shadow"
          >
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{s.label}</p>
              <p className="text-4xl font-bold text-slate-800 mt-2 tabular-nums">{s.value}</p>
              <p className="text-xs text-slate-400 mt-1.5">{s.sub}</p>
            </div>
            <div className={`w-11 h-11 rounded-xl ${s.iconBg} shadow-lg ${s.iconShadow} flex items-center justify-center shrink-0`}>
              <s.icon size={20} className="text-white" />
            </div>
          </div>
        ))}
      </div>

      {/* Recent Conversations */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Recent Conversations</h2>
          <Link
            href="/conversations"
            className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
          >
            View all <ArrowRight size={12} />
          </Link>
        </div>

        {!recent?.length ? (
          <p className="text-sm text-slate-400 text-center py-10">
            No conversations yet. Send a message to your WhatsApp number to start.
          </p>
        ) : (
          <div className="divide-y divide-slate-50">
            {recent.map((conv) => {
              const contact = (conv.contacts as unknown) as { name: string | null; phone: string } | null;
              const displayName = contact?.name ?? contact?.phone ?? 'Unknown';
              const style = STATUS_STYLES[conv.status] ?? STATUS_STYLES.resolved;
              const updatedAt = new Date(conv.updated_at);
              const now = new Date();
              const diffMins = Math.floor((now.getTime() - updatedAt.getTime()) / 60000);
              const timeAgo =
                diffMins < 1 ? 'Just now' :
                diffMins < 60 ? `${diffMins}m ago` :
                diffMins < 1440 ? `${Math.floor(diffMins / 60)}h ago` :
                `${Math.floor(diffMins / 1440)}d ago`;

              return (
                <Link
                  key={conv.id}
                  href={`/conversations/${conv.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 font-bold text-sm shrink-0">
                    {displayName[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{displayName}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {PRODUCT_LABELS[conv.product_type] ?? conv.product_type} bot
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${style.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      {conv.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-slate-400 w-14 text-right">{timeAgo}</span>
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
