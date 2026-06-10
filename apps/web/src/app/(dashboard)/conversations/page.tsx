import { getSupabaseServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { MessageSquare } from 'lucide-react';

const STATUS_STYLES: Record<string, { dot: string; badge: string }> = {
  open:       { dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700' },
  escalated:  { dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700' },
  resolved:   { dot: 'bg-slate-300',   badge: 'bg-slate-100 text-slate-500' },
  bot_paused: { dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700' },
};

const PRODUCT_COLORS: Record<string, string> = {
  support_bot:   'bg-blue-50 text-blue-600',
  sales_bot:     'bg-violet-50 text-violet-600',
  lifecycle_bot: 'bg-orange-50 text-orange-600',
};

const PRODUCT_LABELS: Record<string, string> = {
  support_bot:   'Support',
  sales_bot:     'Sales',
  lifecycle_bot: 'Lifecycle',
};

export default async function ConversationsPage() {
  const supabase = await getSupabaseServerClient();

  const { data: conversations } = await supabase
    .from('conversations')
    .select('*, contacts(phone, name)')
    .order('updated_at', { ascending: false })
    .limit(100);

  return (
    <div className="p-6">
      {!conversations?.length ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <MessageSquare size={24} className="text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-600">No conversations yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Send a WhatsApp message to your bot number to start.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <p className="text-xs text-slate-400">{conversations.length} total</p>
          </div>
          <div className="divide-y divide-slate-50">
            {conversations.map((conv) => {
              const contact = conv.contacts as { phone: string; name: string | null } | null;
              const displayName = contact?.name ?? contact?.phone ?? 'Unknown';
              const style = STATUS_STYLES[conv.status] ?? STATUS_STYLES.resolved;
              const productColor = PRODUCT_COLORS[conv.product_type] ?? 'bg-slate-100 text-slate-500';
              const updatedAt = new Date(conv.updated_at);
              const now = new Date();
              const diffMins = Math.floor((now.getTime() - updatedAt.getTime()) / 60000);
              const timeAgo =
                diffMins < 1 ? 'Just now' :
                diffMins < 60 ? `${diffMins}m` :
                diffMins < 1440 ? `${Math.floor(diffMins / 60)}h` :
                `${Math.floor(diffMins / 1440)}d`;

              return (
                <Link
                  key={conv.id}
                  href={`/conversations/${conv.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 font-bold text-sm shrink-0 ring-2 ring-emerald-100">
                    {displayName[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-emerald-700 transition-colors">
                      {displayName}
                    </p>
                    {contact?.name && (
                      <p className="text-xs text-slate-400 truncate">{contact.phone}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${productColor}`}>
                      {PRODUCT_LABELS[conv.product_type] ?? conv.product_type}
                    </span>
                    <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${style.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      {conv.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-slate-400 w-8 text-right tabular-nums">{timeAgo}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
