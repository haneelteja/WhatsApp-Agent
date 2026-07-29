import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { MessageSquare, AlertCircle } from 'lucide-react';
import { Suspense } from 'react';
import { BotFilterBar } from '@/components/dashboard/BotFilterBar';
import type { ContactSentiment } from '@alphabot/shared';

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

const SENTIMENT_META: Record<ContactSentiment, { emoji: string; bg: string; text: string; label: string }> = {
  positive:   { emoji: '😊', bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Positive'   },
  neutral:    { emoji: '😐', bg: 'bg-slate-100',  text: 'text-slate-500',  label: 'Neutral'    },
  negative:   { emoji: '😟', bg: 'bg-amber-50',   text: 'text-amber-700',  label: 'Unhappy'    },
  frustrated: { emoji: '😤', bg: 'bg-red-50',     text: 'text-red-700',    label: 'Frustrated' },
};

const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
];

const VALID_BOTS    = new Set(['support_bot', 'sales_bot', 'lifecycle_bot']);
const VALID_STATUSES = new Set(['open', 'escalated', 'resolved', 'bot_paused']);

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ bot?: string; status?: string }>;
}) {
  const { bot: botParam, status: statusParam } = await searchParams;
  const botFilter    = botParam    && VALID_BOTS.has(botParam)       ? botParam    : null;
  const statusFilter = statusParam && VALID_STATUSES.has(statusParam) ? statusParam : null;

  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  const tenantId = tenantUser?.tenant_id;

  const [convResult, productsResult, escalatedResult] = await Promise.all([
    tenantId
      ? (() => {
          let q = admin
            .from('conversations')
            .select('*, contacts(phone, name, memory_json)')
            .eq('tenant_id', tenantId)
            .order('updated_at', { ascending: false })
            .limit(100);
          if (botFilter)    q = q.eq('product_type', botFilter);
          if (statusFilter) q = q.eq('status', statusFilter);
          return q;
        })()
      : Promise.resolve({ data: [] as unknown[] }),
    tenantId
      ? admin.from('tenant_products').select('product_type').eq('tenant_id', tenantId).eq('active', true)
      : Promise.resolve({ data: [] }),
    tenantId
      ? admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'escalated')
      : Promise.resolve({ count: 0 }),
  ]);

  const conversations  = (convResult as { data: unknown[] | null }).data ?? [];
  const activeSlugs    = ((productsResult as { data: { product_type: string }[] | null }).data ?? []).map(p => p.product_type);
  const escalatedCount = (escalatedResult as { count: number | null }).count ?? 0;

  const statusTabs = [
    {
      key:     null,
      label:   'All',
      cls:     !statusFilter
        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-200'
        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50',
    },
    {
      key:     'open',
      label:   'Open',
      cls:     statusFilter === 'open'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold'
        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50',
    },
    {
      key:     'escalated',
      label:   null, // rendered specially
      cls:     '',   // not used directly
    },
    {
      key:     'resolved',
      label:   'Resolved',
      cls:     statusFilter === 'resolved'
        ? 'bg-gray-200 text-gray-700 border-gray-300 font-bold'
        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50',
    },
    {
      key:     'bot_paused',
      label:   'Bot Paused',
      cls:     statusFilter === 'bot_paused'
        ? 'bg-amber-50 text-amber-700 border-amber-300 font-bold'
        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50',
    },
  ];

  function statusHref(status: string | null) {
    const params = new URLSearchParams();
    if (botFilter) params.set('bot', botFilter);
    if (status)    params.set('status', status);
    const qs = params.toString();
    return `/conversations${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Conversations</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {statusFilter === 'escalated'
              ? 'Conversations requiring immediate human attention'
              : botFilter
              ? `${PRODUCT_LABELS[botFilter]?.label ?? botFilter} bot conversations`
              : 'All customer conversations across your bots'}
          </p>
        </div>
        {!!conversations.length && (
          <span className="text-xs font-semibold text-gray-500 bg-white border border-green-100 px-3 py-1.5 rounded-full shadow-sm self-start">
            {conversations.length} total
          </span>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {statusTabs.map((tab) => {
          if (tab.key === 'escalated') {
            // Special high-visibility escalated tab
            const isActive = statusFilter === 'escalated';
            return (
              <Link
                key="escalated"
                href={statusHref('escalated')}
                className={`relative flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-full border transition-all duration-150 ${
                  isActive
                    ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-200 scale-105'
                    : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:border-red-400 hover:scale-105'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-white animate-pulse' : 'bg-red-500 animate-pulse'}`} />
                Escalated
                {escalatedCount > 0 && (
                  <span className={`ml-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-red-500 text-white'
                  }`}>
                    {escalatedCount}
                  </span>
                )}
              </Link>
            );
          }

          return (
            <Link
              key={tab.key ?? 'all'}
              href={statusHref(tab.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${tab.cls}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Bot filter tabs — only visible when 2+ bots are active */}
      <Suspense>
        <BotFilterBar activeSlugs={activeSlugs} current={botFilter} />
      </Suspense>

      {!conversations.length ? (
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm flex flex-col items-center justify-center py-24 text-center">
          {statusFilter === 'escalated' ? (
            <>
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4 border border-emerald-100">
                <AlertCircle size={28} className="text-emerald-400" />
              </div>
              <p className="text-sm font-semibold text-gray-600">All clear — no escalations</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">No conversations are currently waiting for human attention.</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mb-4 border border-green-100">
                <MessageSquare size={28} className="text-green-400" />
              </div>
              <p className="text-sm font-semibold text-gray-600">No conversations yet</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">
                {botFilter ? 'No conversations for this bot. Switch to All or try another bot.' : 'Send a WhatsApp message to your bot number to start.'}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${statusFilter === 'escalated' ? 'border-red-100' : 'border-green-100'}`}>
          <div className="divide-y divide-green-50">
            {(conversations as {
              id: string;
              status: string;
              product_type: string;
              updated_at: string;
              contacts: { phone: string; name: string | null; memory_json: Record<string, unknown> | null } | null;
            }[]).map((conv) => {
              const contact = conv.contacts;
              const displayName = contact?.name ?? contact?.phone ?? 'Unknown';
              const style    = STATUS_STYLES[conv.status] ?? STATUS_STYLES.resolved;
              const product  = PRODUCT_LABELS[conv.product_type];
              const colorIdx = displayName.charCodeAt(0) % AVATAR_COLORS.length;

              const sentiment = contact?.memory_json?.['sentiment'] as ContactSentiment | undefined;
              const sentimentMeta = sentiment ? SENTIMENT_META[sentiment] : null;

              const updatedAt = new Date(conv.updated_at);
              const diffMins  = Math.floor((Date.now() - updatedAt.getTime()) / 60000);
              const timeAgo   =
                diffMins < 1    ? 'Just now' :
                diffMins < 60   ? `${diffMins}m` :
                diffMins < 1440 ? `${Math.floor(diffMins / 60)}h` :
                `${Math.floor(diffMins / 1440)}d`;

              return (
                <Link
                  key={conv.id}
                  href={`/conversations/${conv.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-green-50/60 transition-colors group"
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full ${AVATAR_COLORS[colorIdx]} flex items-center justify-center font-bold text-sm shrink-0`}>
                    {displayName[0]?.toUpperCase() ?? '?'}
                  </div>

                  {/* Name + phone */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-emerald-700 transition-colors">
                      {displayName}
                    </p>
                    {contact?.name && (
                      <p className="text-xs text-gray-400 truncate">{contact.phone}</p>
                    )}
                  </div>

                  {/* Badges + time */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    {sentimentMeta && (
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${sentimentMeta.bg} ${sentimentMeta.text}`}
                        title={sentimentMeta.label}
                      >
                        {sentimentMeta.emoji} {sentimentMeta.label}
                      </span>
                    )}
                    {product && !botFilter && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${product.color}`}>
                        {product.label}
                      </span>
                    )}
                    <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ring-1 ${style.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      {conv.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-400 w-8 text-right tabular-nums">{timeAgo}</span>
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
