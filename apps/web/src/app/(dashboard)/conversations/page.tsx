export const dynamic = 'force-dynamic';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  MessageSquare, AlertCircle, Phone, PhoneCall, PhoneOff, PhoneMissed,
  Clock, TrendingUp, IndianRupee, Users, Star, Search,
} from 'lucide-react';
import { BotFilterBar } from '@/components/dashboard/BotFilterBar';
import { MakeCallButton } from '@/components/dashboard/MakeCallButton';
import { AutoRefresh } from '@/components/dashboard/AutoRefresh';
import { ContactGroupAssign } from '@/components/dashboard/ContactGroupAssign';
import type { ContactSentiment } from '@alphabot/shared';

// ── Shared constants ──────────────────────────────────────────────────────────

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

function formatRelative(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ── Chats section ─────────────────────────────────────────────────────────────

const CONV_STATUS_STYLES: Record<string, { dot: string; badge: string }> = {
  open:       { dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  escalated:  { dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700 ring-red-100' },
  resolved:   { dot: 'bg-gray-300',    badge: 'bg-gray-100 text-gray-500 ring-gray-200' },
  bot_paused: { dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-amber-100' },
};

const SENTIMENT_META: Record<ContactSentiment, { emoji: string; bg: string; text: string; label: string }> = {
  positive:   { emoji: '😊', bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Positive'   },
  neutral:    { emoji: '😐', bg: 'bg-slate-100',  text: 'text-slate-500',  label: 'Neutral'    },
  negative:   { emoji: '😟', bg: 'bg-amber-50',   text: 'text-amber-700',  label: 'Unhappy'    },
  frustrated: { emoji: '😤', bg: 'bg-red-50',     text: 'text-red-700',    label: 'Frustrated' },
};

const VALID_BOTS     = new Set(['support_bot', 'sales_bot', 'lifecycle_bot']);
const VALID_STATUSES = new Set(['open', 'escalated', 'resolved', 'bot_paused']);

// ── Voice section ─────────────────────────────────────────────────────────────

type VoiceCallRow = {
  id: string; to_number: string; from_number: string; status: string; direction: string;
  duration_seconds: number | null; turn_count: number; telephony_provider: string;
  stt_provider: string; triggered_by: string; cost_rupees: number | null; transcript: string | null;
  outcome_json: { intent?: string; resolved?: boolean; escalation_needed?: boolean; sentiment?: string; summary?: string } | null;
  created_at: string;
};

const VOICE_STATUS_STYLES: Record<string, string> = {
  completed:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  in_progress: 'bg-sky-50 text-sky-700 border-sky-200',
  initiated:   'bg-violet-50 text-violet-700 border-violet-200',
  ringing:     'bg-amber-50 text-amber-700 border-amber-200',
  failed:      'bg-red-50 text-red-700 border-red-200',
  no_answer:   'bg-orange-50 text-orange-700 border-orange-200',
  voicemail:   'bg-slate-50 text-slate-600 border-slate-200',
  busy:        'bg-red-50 text-red-700 border-red-200',
};

const SENTIMENT_EMOJI: Record<string, string> = {
  positive: '😊', neutral: '😐', negative: '😞', frustrated: '😤',
};

function formatDuration(s: number | null): string {
  if (!s) return '—';
  const m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

// ── Contacts section ──────────────────────────────────────────────────────────

type ConversationRow = { id: string; product_type: string; status: string; updated_at: string };

type ContactRow = {
  id: string; phone: string | null; bsuid: string | null; name: string | null;
  memory_json: {
    preferences?: Record<string, string>; order_history?: string[]; open_issues?: string[];
    last_interaction?: string | null; sentiment?: string; sentiment_updated_at?: string | null;
    awaiting_csat?: boolean; csat_score?: number;
  } | null;
  created_at: string; updated_at: string;
  conversations: ConversationRow[];
};

const CONTACT_SENTIMENT_STYLES: Record<string, { label: string; dot: string; badge: string }> = {
  positive:   { label: 'Positive',   dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  neutral:    { label: 'Neutral',    dot: 'bg-slate-300',   badge: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200' },
  negative:   { label: 'Negative',   dot: 'bg-orange-400',  badge: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' },
  frustrated: { label: 'Frustrated', dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
};

function contactDisplayName(c: ContactRow): string {
  return c.name ?? c.phone ?? c.bsuid ?? 'Unknown';
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; bot?: string; status?: string; sentiment?: string; q?: string }>;
}) {
  const { tab: tabParam, bot: botParam, status: statusParam, sentiment: sentimentFilter = 'all', q: search = '' } = await searchParams;

  const activeTab = tabParam === 'voice' ? 'voice' : tabParam === 'contacts' ? 'contacts' : 'chats';
  const botFilter    = botParam    && VALID_BOTS.has(botParam)       ? botParam    : null;
  const statusFilter = statusParam && VALID_STATUSES.has(statusParam) ? statusParam : null;

  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenantUser } = await admin
    .from('tenant_users').select('tenant_id').eq('user_id', user.id).single();
  const tenantId = tenantUser?.tenant_id ?? '';

  const apiBase = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://whatsapp-agent-fmtg.onrender.com';

  function tabHref(t: string) {
    return `/conversations?tab=${t}`;
  }

  // ── Tab switcher ─────────────────────────────────────────────────────────────
  const tabs = [
    { key: 'chats',    label: 'Chats',    icon: MessageSquare },
    { key: 'voice',    label: 'Voice',    icon: Phone },
    { key: 'contacts', label: 'Contacts', icon: Users },
  ];

  // ── Data fetching (only the active tab) ──────────────────────────────────────

  // Chats data
  let conversations: unknown[] = [];
  let activeSlugs: string[]    = [];
  let escalatedCount           = 0;

  if (activeTab === 'chats') {
    const [convResult, productsResult, escalatedResult] = await Promise.all([
      (() => {
        let q = admin
          .from('conversations')
          .select('*, contacts(phone, name, memory_json)')
          .eq('tenant_id', tenantId)
          .order('updated_at', { ascending: false })
          .limit(100);
        if (botFilter)    q = q.eq('product_type', botFilter);
        if (statusFilter) q = q.eq('status', statusFilter);
        return q;
      })(),
      admin.from('tenant_products').select('product_type').eq('tenant_id', tenantId).eq('active', true),
      admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'escalated'),
    ]);
    conversations  = convResult.data ?? [];
    activeSlugs    = (productsResult.data ?? []).map((p: { product_type: string }) => p.product_type);
    escalatedCount = escalatedResult.count ?? 0;
  }

  // Voice data
  let callList: VoiceCallRow[] = [];
  let totalCalls = 0;
  let chartDays: { key: string; label: string; count: number }[] = [];
  let chartMax = 1;
  let voiceStats: { label: string; value: string; sub: string; icon: React.ElementType; color: string; bg: string }[] = [];

  if (activeTab === 'voice') {
    const thirtyDaysAgo   = new Date(Date.now() - 30 * 86400000).toISOString();
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();

    const [
      { data: chartCalls },
      { data: calls, count: totalCallsRaw },
      { count: completedCalls },
      { count: failedCalls },
      { count: voicemailCalls },
      { data: costData },
    ] = await Promise.all([
      admin.from('voice_calls').select('created_at, status').eq('tenant_id', tenantId).gte('created_at', fourteenDaysAgo),
      admin.from('voice_calls').select('*', { count: 'exact' }).eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(50),
      admin.from('voice_calls').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'completed').gte('created_at', thirtyDaysAgo),
      admin.from('voice_calls').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'failed').gte('created_at', thirtyDaysAgo),
      admin.from('voice_calls').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'voicemail').gte('created_at', thirtyDaysAgo),
      admin.from('voice_calls').select('cost_rupees, duration_seconds').eq('tenant_id', tenantId).gte('created_at', thirtyDaysAgo),
    ]);

    const dailyMap = new Map<string, number>();
    for (const c of (chartCalls ?? []) as Array<{ created_at: string }>) {
      const day = c.created_at.slice(0, 10);
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
    }
    chartDays = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.now() - (13 - i) * 86400000);
      const key = d.toISOString().slice(0, 10);
      return { key, label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), count: dailyMap.get(key) ?? 0 };
    });
    chartMax  = Math.max(...chartDays.map(d => d.count), 1);
    callList  = (calls ?? []) as VoiceCallRow[];
    totalCalls = totalCallsRaw ?? 0;

    const totalCost = (costData ?? []).reduce((s, c) => s + (c.cost_rupees ?? 0), 0);
    const withDuration = (costData ?? []).filter(c => c.duration_seconds);
    const avgDuration  = withDuration.length
      ? Math.round(withDuration.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / withDuration.length)
      : 0;

    voiceStats = [
      { label: 'Total Calls (30d)', value: (totalCallsRaw ?? 0).toString(), sub: 'All statuses', icon: Phone, color: 'text-emerald-600', bg: 'bg-emerald-50' },
      { label: 'Completed', value: (completedCalls ?? 0).toString(), sub: 'Successfully answered', icon: PhoneCall, color: 'text-sky-600', bg: 'bg-sky-50' },
      { label: 'No Answer / Failed', value: ((failedCalls ?? 0) + (voicemailCalls ?? 0)).toString(), sub: `${voicemailCalls ?? 0} voicemail`, icon: PhoneMissed, color: 'text-orange-600', bg: 'bg-orange-50' },
      { label: 'Avg Duration', value: formatDuration(avgDuration), sub: 'Completed calls only', icon: Clock, color: 'text-violet-600', bg: 'bg-violet-50' },
      { label: 'Est. Cost (30d)', value: `₹${totalCost.toFixed(2)}`, sub: 'All providers combined', icon: IndianRupee, color: 'text-amber-600', bg: 'bg-amber-50' },
    ];
  }

  // Contacts data
  let contactRows: ContactRow[] = [];
  let contactStats = { total: 0, activeThisWeek: 0, positive: 0, frustrated: 0 };
  let allGroups: { id: string; name: string; color: string; emoji: string }[] = [];
  // Map of contact_id → assigned groups
  let groupMembershipMap = new Map<string, { group_id: string; name: string; color: string; emoji: string; added_by: string }[]>();

  if (activeTab === 'contacts') {
    let query = admin
      .from('contacts')
      .select('id, phone, bsuid, name, memory_json, created_at, updated_at, conversations(id, product_type, status, updated_at)')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .limit(200);

    if (sentimentFilter !== 'all') query = query.eq('memory_json->>sentiment', sentimentFilter);
    if (search.trim()) {
      const safeQ = search.trim().replace(/[,()]/g, ' ');
      query = query.or(`name.ilike.%${safeQ}%,phone.ilike.%${safeQ}%`);
    }

    const [{ data: contacts }, { data: groupsData }, { data: membersData }] = await Promise.all([
      query,
      admin.from('contact_groups').select('id, name, color, emoji').eq('tenant_id', tenantId).order('name'),
      admin.from('contact_group_members').select('contact_id, group_id, added_by, contact_groups(name, color, emoji)').eq('tenant_id', tenantId),
    ]);

    contactRows = (contacts ?? []) as unknown as ContactRow[];
    allGroups   = (groupsData ?? []) as typeof allGroups;

    for (const m of (membersData ?? []) as Array<{ contact_id: string; group_id: string; added_by: string; contact_groups: { name: string; color: string; emoji: string } | null }>) {
      if (!m.contact_groups) continue;
      const existing = groupMembershipMap.get(m.contact_id) ?? [];
      existing.push({ group_id: m.group_id, name: m.contact_groups.name, color: m.contact_groups.color, emoji: m.contact_groups.emoji, added_by: m.added_by });
      groupMembershipMap.set(m.contact_id, existing);
    }

    const oneWeekAgo = Date.now() - 7 * 86_400_000;
    const bySentiment = { positive: 0, neutral: 0, negative: 0, frustrated: 0 };
    for (const c of contactRows) {
      const s = c.memory_json?.sentiment;
      if (s && s in bySentiment) bySentiment[s as keyof typeof bySentiment]++;
    }
    contactStats = {
      total: contactRows.length,
      activeThisWeek: contactRows.filter(c => new Date(c.updated_at).getTime() > oneWeekAgo).length,
      positive: bySentiment.positive,
      frustrated: bySentiment.frustrated,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function statusHref(status: string | null) {
    const p = new URLSearchParams();
    p.set('tab', 'chats');
    if (botFilter) p.set('bot', botFilter);
    if (status)    p.set('status', status);
    return `/conversations?${p.toString()}`;
  }

  const contactSentimentTabs = [
    { key: 'all', label: 'All', count: null },
    { key: 'positive',   label: 'Positive',   count: contactStats.positive },
    { key: 'neutral',    label: 'Neutral',     count: null },
    { key: 'negative',   label: 'Negative',    count: null },
    { key: 'frustrated', label: 'Frustrated',  count: contactStats.frustrated },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {activeTab === 'chats'    ? 'Conversations' :
             activeTab === 'voice'    ? 'Voice Calls' :
                                        'Contacts'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeTab === 'chats'
              ? (statusFilter === 'escalated'
                  ? 'Conversations requiring immediate human attention'
                  : botFilter
                  ? `${PRODUCT_LABELS[botFilter]?.label ?? botFilter} bot conversations`
                  : 'All customer conversations across your bots')
              : activeTab === 'voice'
              ? 'AI voice call log — outbound escalations and campaigns'
              : 'All customers who have messaged your bot'}
          </p>
        </div>
        {activeTab === 'chats' && conversations.length > 0 && (
          <span className="text-xs font-semibold text-gray-500 bg-white border border-green-100 px-3 py-1.5 rounded-full shadow-sm self-start">
            {conversations.length} total
          </span>
        )}
        {activeTab === 'voice' && (
          <div className="flex items-center gap-2">
            <MakeCallButton tenantId={tenantId} productSlug="support_bot" apiBase={apiBase} />
            <Link href="/campaigns" className="text-sm font-medium border border-emerald-200 text-emerald-700 px-4 py-2 rounded-xl hover:bg-emerald-50 transition-colors">
              + Campaign
            </Link>
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 bg-white border border-green-100 rounded-xl shadow-sm p-1 w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <Link key={key} href={tabHref(key)}
            className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === key ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon size={14} /> {label}
          </Link>
        ))}
      </div>

      {/* ── CHATS TAB ─────────────────────────────────────────────────────────── */}
      {activeTab === 'chats' && (
        <>
          {/* Status filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { key: null,         label: 'All',        cls: !statusFilter ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50' },
              { key: 'open',       label: 'Open',       cls: statusFilter === 'open'       ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50' },
              { key: 'resolved',   label: 'Resolved',   cls: statusFilter === 'resolved'   ? 'bg-gray-200 text-gray-700 border-gray-300 font-bold' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50' },
              { key: 'bot_paused', label: 'Bot Paused', cls: statusFilter === 'bot_paused' ? 'bg-amber-50 text-amber-700 border-amber-300 font-bold' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50' },
            ] as const).map(tab => (
              <Link key={tab.key ?? 'all'} href={statusHref(tab.key)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${tab.cls}`}>
                {tab.label}
              </Link>
            ))}
            {/* Escalated special tab */}
            <Link href={statusHref('escalated')}
              className={`relative flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-full border transition-all duration-150 ${
                statusFilter === 'escalated'
                  ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-200 scale-105'
                  : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:border-red-400 hover:scale-105'
              }`}>
              <span className={`w-2 h-2 rounded-full animate-pulse ${statusFilter === 'escalated' ? 'bg-white' : 'bg-red-500'}`} />
              Escalated
              {escalatedCount > 0 && (
                <span className={`ml-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                  statusFilter === 'escalated' ? 'bg-white/20 text-white' : 'bg-red-500 text-white'
                }`}>{escalatedCount}</span>
              )}
            </Link>
          </div>

          {/* Bot filter */}
          <Suspense>
            <BotFilterBar activeSlugs={activeSlugs} current={botFilter} />
          </Suspense>

          {conversations.length === 0 ? (
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
                  id: string; status: string; product_type: string; updated_at: string;
                  contacts: { phone: string; name: string | null; memory_json: Record<string, unknown> | null } | null;
                }[]).map(conv => {
                  const contact     = conv.contacts;
                  const displayName = contact?.name ?? contact?.phone ?? 'Unknown';
                  const style       = CONV_STATUS_STYLES[conv.status] ?? CONV_STATUS_STYLES.resolved;
                  const product     = PRODUCT_LABELS[conv.product_type];
                  const colorIdx    = displayName.charCodeAt(0) % AVATAR_COLORS.length;
                  const sentiment   = contact?.memory_json?.['sentiment'] as ContactSentiment | undefined;
                  const sentMeta    = sentiment ? SENTIMENT_META[sentiment] : null;
                  const diffMins    = Math.floor((Date.now() - new Date(conv.updated_at).getTime()) / 60000);
                  const timeAgo     = diffMins < 1 ? 'Just now' : diffMins < 60 ? `${diffMins}m` : diffMins < 1440 ? `${Math.floor(diffMins / 60)}h` : `${Math.floor(diffMins / 1440)}d`;

                  return (
                    <Link key={conv.id} href={`/conversations/${conv.id}`}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-green-50/60 transition-colors group">
                      <div className={`w-10 h-10 rounded-full ${AVATAR_COLORS[colorIdx]} flex items-center justify-center font-bold text-sm shrink-0`}>
                        {displayName[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-emerald-700 transition-colors">{displayName}</p>
                        {contact?.name && <p className="text-xs text-gray-400 truncate">{contact.phone}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        {sentMeta && (
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${sentMeta.bg} ${sentMeta.text}`} title={sentMeta.label}>
                            {sentMeta.emoji} {sentMeta.label}
                          </span>
                        )}
                        {product && !botFilter && (
                          <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${product.color}`}>{product.label}</span>
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
        </>
      )}

      {/* ── VOICE TAB ─────────────────────────────────────────────────────────── */}
      {activeTab === 'voice' && (
        <>
          <AutoRefresh active={callList.some(c => ['in_progress', 'initiated', 'ringing'].includes(c.status))} />
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            {voiceStats.map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-green-100 p-4 shadow-sm">
                <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center mb-3`}>
                  <s.icon size={15} className={s.color} />
                </div>
                <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
                <p className="text-xs font-semibold text-gray-700 mt-1">{s.label}</p>
                <p className="text-[11px] text-gray-400">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Calls per day</h3>
              <span className="text-xs text-gray-400">Last 14 days</span>
            </div>
            <div className="flex items-end gap-1 h-24">
              {chartDays.map(day => (
                <div key={day.key} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="relative flex-1 w-full flex items-end">
                    <div
                      className="w-full bg-emerald-500 rounded-t-sm group-hover:bg-emerald-400 transition-colors"
                      style={{ height: day.count === 0 ? '2px' : `${Math.max(4, (day.count / chartMax) * 80)}px`, opacity: day.count === 0 ? 0.2 : 1 }}
                      title={`${day.label}: ${day.count} call${day.count !== 1 ? 's' : ''}`}
                    />
                    {day.count > 0 && (
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {day.count}
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] text-gray-300 rotate-45 origin-left translate-y-1 hidden sm:block">
                    {day.label.split(' ')[0]}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-3 text-[10px] text-gray-300">
              <span>{chartDays[0]!.label}</span>
              <span>{chartDays[13]!.label}</span>
            </div>
          </div>

          {/* Call log */}
          <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-green-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Recent Calls</h3>
              <span className="text-xs text-gray-400">{totalCalls} total</span>
            </div>
            {callList.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <PhoneOff size={32} className="text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-400">No voice calls yet</p>
                <p className="text-xs text-gray-300 mt-1">Enable voice in Guardrails → Per-Bot Config, then enable auto-dispatch on escalation.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {callList.map(call => (
                  <Link key={call.id} href={`/voice/${call.id}`} className="block px-5 py-4 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        call.status === 'completed' ? 'bg-emerald-100' :
                        call.status === 'failed' || call.status === 'no_answer' ? 'bg-red-100' : 'bg-amber-100'
                      }`}>
                        {call.direction === 'inbound' ? <PhoneCall size={14} className="text-gray-600" /> : <Phone size={14} className="text-gray-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-800">{call.to_number}</span>
                          {call.from_number && <span className="text-[11px] text-gray-400">from {call.from_number}</span>}
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${VOICE_STATUS_STYLES[call.status] ?? 'bg-gray-50 text-gray-500'}`}>
                            {call.status.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">{call.triggered_by}</span>
                          {call.outcome_json?.sentiment && <span title={call.outcome_json.sentiment}>{SENTIMENT_EMOJI[call.outcome_json.sentiment]}</span>}
                        </div>
                        {call.outcome_json?.summary && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{call.outcome_json.summary}</p>}
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                          <span>{call.telephony_provider} · {call.stt_provider}</span>
                          <span>{formatDuration(call.duration_seconds)}</span>
                          {call.turn_count > 0 && <span>{call.turn_count} turns</span>}
                          {call.cost_rupees != null && <span>₹{call.cost_rupees.toFixed(2)}</span>}
                          {call.outcome_json?.resolved != null && (
                            <span className={call.outcome_json.resolved ? 'text-emerald-500' : 'text-red-400'}>
                              {call.outcome_json.resolved ? '✓ Resolved' : '✗ Unresolved'}
                            </span>
                          )}
                          <span className="ml-auto">{new Date(call.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</span>
                        </div>
                      </div>
                      <TrendingUp size={13} className="text-gray-200 mt-1.5 shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── CONTACTS TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'contacts' && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: <Users size={18} className="text-emerald-600" />,  label: 'Total Contacts',    value: contactStats.total,          bg: 'bg-emerald-50' },
              { icon: <Clock size={18} className="text-blue-600" />,     label: 'Active This Week',  value: contactStats.activeThisWeek, bg: 'bg-blue-50'    },
              { icon: <Star size={18} className="text-amber-500" />,     label: 'Positive Sentiment',value: contactStats.positive,        bg: 'bg-amber-50'   },
              { icon: <AlertCircle size={18} className="text-red-500" />,label: 'Frustrated',        value: contactStats.frustrated,      bg: 'bg-red-50'     },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>{s.icon}</div>
                <div>
                  <p className="text-xl font-bold text-slate-900 tabular-nums">{s.value.toLocaleString()}</p>
                  <p className="text-xs text-slate-500">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <form method="GET" className="relative flex-1 max-w-xs">
              <input type="hidden" name="tab" value="contacts" />
              {sentimentFilter !== 'all' && <input type="hidden" name="sentiment" value={sentimentFilter} />}
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input name="q" defaultValue={search} placeholder="Search by name or phone…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400" />
            </form>
            <div className="flex gap-1 flex-wrap">
              {contactSentimentTabs.map(tab => {
                const p = new URLSearchParams();
                p.set('tab', 'contacts');
                if (tab.key !== 'all') p.set('sentiment', tab.key);
                if (search.trim()) p.set('q', search.trim());
                const active = sentimentFilter === tab.key || (tab.key === 'all' && sentimentFilter === 'all');
                return (
                  <Link key={tab.key} href={`/conversations?${p.toString()}`}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      active ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
                    }`}>
                    {tab.label}
                    {tab.count !== null && tab.count > 0 && (
                      <span className={`ml-1.5 ${active ? 'text-emerald-200' : 'text-slate-400'}`}>{tab.count}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Contact list */}
          {contactRows.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <Users size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">No contacts found</p>
              <p className="text-slate-400 text-sm mt-1">
                {search ? 'Try a different search term' : 'Contacts appear once customers message your bot'}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {contactRows.map(contact => {
                const mem          = contact.memory_json ?? {};
                const sentiment    = mem.sentiment ?? 'neutral';
                const sentStyle    = CONTACT_SENTIMENT_STYLES[sentiment] ?? CONTACT_SENTIMENT_STYLES.neutral!;
                const convos       = contact.conversations ?? [];
                const openIssues   = mem.open_issues ?? [];
                const preferences  = mem.preferences ?? {};
                const prefEntries  = Object.entries(preferences).slice(0, 3);
                const latestConvoId = convos.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]?.id;

                return (
                  <div key={contact.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50/70 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 text-emerald-700 font-semibold text-sm">
                      {contactDisplayName(contact).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 text-sm">{contactDisplayName(contact)}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sentStyle.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sentStyle.dot}`} />
                          {sentStyle.label}
                        </span>
                        {mem.awaiting_csat && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 ring-1 ring-purple-200">CSAT pending</span>
                        )}
                        {mem.csat_score !== undefined && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200">CSAT {mem.csat_score}/5</span>
                        )}
                      </div>
                      {contact.phone && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Phone size={11} className="text-slate-400" />
                          <span className="text-xs text-slate-500">{contact.phone}</span>
                        </div>
                      )}
                      {prefEntries.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {prefEntries.map(([k, v]) => (
                            <span key={k} className="px-2 py-0.5 rounded-md text-xs bg-slate-100 text-slate-600">
                              <span className="text-slate-400">{k}:</span> {v}
                            </span>
                          ))}
                          {Object.keys(preferences).length > 3 && (
                            <span className="px-2 py-0.5 rounded-md text-xs bg-slate-100 text-slate-400">+{Object.keys(preferences).length - 3} more</span>
                          )}
                        </div>
                      )}
                      {openIssues.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <AlertCircle size={11} className="text-orange-400 shrink-0" />
                          <span className="text-xs text-orange-600 truncate">{openIssues[0]}</span>
                          {openIssues.length > 1 && <span className="text-xs text-slate-400">+{openIssues.length - 1}</span>}
                        </div>
                      )}
                      {allGroups.length > 0 && (
                        <div className="mt-2">
                          <ContactGroupAssign
                            contactId={contact.id}
                            allGroups={allGroups}
                            assignedGroups={groupMembershipMap.get(contact.id) ?? []}
                          />
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5 text-right">
                      <span className="text-xs text-slate-400">{formatRelative(contact.updated_at)}</span>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <MessageSquare size={11} className="text-slate-400" />
                        <span>{convos.length} conv{convos.length !== 1 ? 's' : ''}</span>
                      </div>
                      {latestConvoId && (
                        <Link href={`/conversations/${latestConvoId}`}
                          className="text-xs text-emerald-600 hover:text-emerald-700 font-medium hover:underline">
                          View chat →
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-xs text-slate-400 text-center">
            Showing {contactRows.length} contact{contactRows.length !== 1 ? 's' : ''}
            {sentimentFilter !== 'all' ? ` · filtered by ${sentimentFilter}` : ''}
            {search ? ` · matching "${search}"` : ''}
          </p>
        </>
      )}
    </div>
  );
}
