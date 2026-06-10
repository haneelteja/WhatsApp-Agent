import { getSupabaseServerClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ConversationMessages } from '@/components/conversation-messages';
import { ConversationActions } from '@/components/conversation-actions';

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

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: conversation } = await supabase
    .from('conversations')
    .select('*, contacts(phone, name)')
    .eq('id', id)
    .single();

  if (!conversation) notFound();

  const { data: messages } = await supabase
    .from('messages')
    .select('id, role, content, timestamp, confidence_score')
    .eq('conversation_id', id)
    .order('timestamp', { ascending: true });

  const contact = conversation.contacts as { phone: string; name: string | null } | null;
  const displayName = contact?.name ?? contact?.phone ?? 'Unknown';
  const style = STATUS_STYLES[conversation.status] ?? STATUS_STYLES.resolved;
  const productColor = PRODUCT_COLORS[conversation.product_type] ?? 'bg-slate-100 text-slate-500';

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-white border-b border-slate-200 shrink-0">
        <Link
          href="/conversations"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <ChevronLeft size={18} />
        </Link>

        <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 font-bold text-sm shrink-0 ring-2 ring-emerald-100">
          {displayName[0]?.toUpperCase() ?? '?'}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
          <p className="text-xs text-slate-400 truncate">{contact?.phone}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${productColor}`}>
            {conversation.product_type.replace(/_bot$/, '').replace(/_/g, ' ')} bot
          </span>
          <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${style.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            {conversation.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Messages */}
      <ConversationMessages
        conversationId={id}
        initialMessages={messages ?? []}
      />

      {/* Actions */}
      <ConversationActions conversationId={id} status={conversation.status} />
    </div>
  );
}
