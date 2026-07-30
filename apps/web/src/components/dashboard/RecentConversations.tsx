'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, MessageSquare, ArrowRight, Bot, User, Loader2 } from 'lucide-react';
import { getRecentConversationsAction, type RecentConv } from '@/app/actions/recent-conversations';

const STATUS_STYLES: Record<string, { dot: string; badge: string }> = {
  open:       { dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  escalated:  { dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700 ring-red-100' },
  resolved:   { dot: 'bg-gray-300',    badge: 'bg-gray-100 text-gray-500 ring-gray-200' },
  bot_paused: { dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-amber-100' },
};

const PRODUCT_LABELS: Record<string, { label: string; color: string }> = {
  support_bot:   { label: 'Support',   color: 'bg-sky-50 text-sky-600' },
  sales_bot:     { label: 'Sales',     color: 'bg-violet-50 text-violet-600' },
  lifecycle_bot: { label: 'Lifecycle', color: 'bg-orange-50 text-orange-600' },
};

const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
];

function timeAgo(ts: string) {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1)    return 'Just now';
  if (mins < 60)   return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

function ConvRow({ conv }: { conv: RecentConv }) {
  const [open, setOpen] = useState(false);
  const style     = STATUS_STYLES[conv.status] ?? STATUS_STYLES.resolved;
  const product   = PRODUCT_LABELS[conv.product_type];
  const colorIdx  = conv.displayName.charCodeAt(0) % AVATAR_COLORS.length;

  return (
    <div>
      {/* Header row */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors text-left cursor-pointer"
      >
        {/* Avatar */}
        <div className={`w-8 h-8 rounded-full ${AVATAR_COLORS[colorIdx]} flex items-center justify-center font-bold text-xs shrink-0`}>
          {conv.displayName.slice(0, 2).toUpperCase()}
        </div>

        {/* Name + bot type */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{conv.displayName}</p>
          {product && (
            <span className={`inline-block text-[10px] font-medium px-1.5 py-px rounded mt-0.5 ${product.color}`}>
              {product.label}
            </span>
          )}
        </div>

        {/* Status + time + chevron */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ring-1 ${style.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            {conv.status.replace('_', ' ')}
          </span>
          <span className="text-[11px] text-gray-400 w-12 text-right tabular-nums">{timeAgo(conv.updated_at)}</span>
          {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </button>

      {/* Expanded messages */}
      {open && (
        <div className="px-5 py-3 bg-gray-50/60 space-y-2">
          {conv.messages.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic">No messages yet.</p>
          ) : (
            conv.messages.map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? '' : 'flex-row-reverse'}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  msg.role === 'user' ? 'bg-gray-200' : 'bg-emerald-100'
                }`}>
                  {msg.role === 'user'
                    ? <User size={10} className="text-gray-500" />
                    : <Bot  size={10} className="text-emerald-600" />
                  }
                </div>
                <div className={`max-w-[75%] rounded-xl px-3 py-1.5 text-[11px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-white border border-gray-200 text-gray-700 rounded-tl-none'
                    : 'bg-emerald-50 border border-emerald-100 text-gray-700 rounded-tr-none'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))
          )}
          <div className="pt-1">
            <Link
              href={`/conversations/${conv.id}`}
              className="text-[11px] font-semibold text-emerald-600 hover:underline flex items-center gap-1"
            >
              Open full conversation <ArrowRight size={10} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function RecentConversations({ initial }: { initial: RecentConv[] }) {
  const [convs, setConvs]     = useState<RecentConv[]>(initial);
  const [hasMore, setHasMore] = useState(initial.length === 5);
  const [isPending, start]    = useTransition();

  function loadMore() {
    start(async () => {
      const more = await getRecentConversationsAction(convs.length);
      if (more.length < 5) setHasMore(false);
      setConvs(prev => [...prev, ...more]);
    });
  }

  if (convs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3 border border-emerald-100">
          <MessageSquare size={20} className="text-emerald-400" />
        </div>
        <p className="text-sm font-semibold text-gray-600">No conversations yet</p>
        <p className="text-xs text-gray-400 mt-1 max-w-xs">
          Send a WhatsApp message to your bot number to see conversations appear here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="divide-y divide-gray-50">
        {convs.map(conv => <ConvRow key={conv.id} conv={conv} />)}
      </div>

      {hasMore && (
        <div className="px-5 py-3 border-t border-gray-50">
          <button
            type="button"
            onClick={loadMore}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50 transition-colors"
          >
            {isPending
              ? <><Loader2 size={12} className="animate-spin" /> Loading...</>
              : <>Show 5 more <ChevronDown size={12} /></>
            }
          </button>
        </div>
      )}
    </div>
  );
}
