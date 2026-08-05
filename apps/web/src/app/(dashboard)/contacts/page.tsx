import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  Users,
  MessageSquare,
  AlertCircle,
  Star,
  Search,
  Phone,
  Clock,
} from 'lucide-react';

type SearchParams = Promise<{ sentiment?: string; q?: string }>;

type ConversationRow = { id: string; product_type: string; status: string; updated_at: string };

type ContactRow = {
  id: string;
  phone: string | null;
  bsuid: string | null;
  name: string | null;
  memory_json: {
    preferences?: Record<string, string>;
    order_history?: string[];
    open_issues?: string[];
    last_interaction?: string | null;
    sentiment?: string;
    sentiment_updated_at?: string | null;
    awaiting_csat?: boolean;
    csat_score?: number;
  } | null;
  created_at: string;
  updated_at: string;
  conversations: ConversationRow[];
};

const SENTIMENT_STYLES: Record<string, { label: string; dot: string; badge: string }> = {
  positive:   { label: 'Positive',   dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  neutral:    { label: 'Neutral',    dot: 'bg-slate-300',   badge: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200' },
  negative:   { label: 'Negative',   dot: 'bg-orange-400',  badge: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' },
  frustrated: { label: 'Frustrated', dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
};

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days < 7)    return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function contactDisplayName(c: ContactRow): string {
  if (c.name) return c.name;
  if (c.phone) return c.phone;
  if (c.bsuid) return c.bsuid;
  return 'Unknown';
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { sentiment: sentimentFilter = 'all', q: search = '' } = await searchParams;

  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!tenantUser?.tenant_id) redirect('/login');
  const tenantId = tenantUser.tenant_id as string;

  // Build query
  let query = admin
    .from('contacts')
    .select(`
      id, phone, bsuid, name, memory_json, created_at, updated_at,
      conversations(id, product_type, status, updated_at)
    `)
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (sentimentFilter !== 'all') {
    query = query.eq('memory_json->>sentiment', sentimentFilter);
  }

  if (search.trim()) {
    const safeQ = search.trim().replace(/[,()]/g, ' ');
    query = query.or(`name.ilike.%${safeQ}%,phone.ilike.%${safeQ}%`);
  }

  const { data: contacts } = await query;
  const rows = (contacts ?? []) as unknown as ContactRow[];

  // Stats
  const oneWeekAgo = Date.now() - 7 * 86_400_000;
  const activeThisWeek = rows.filter(c => new Date(c.updated_at).getTime() > oneWeekAgo).length;
  const bySentiment = { positive: 0, neutral: 0, negative: 0, frustrated: 0 };
  for (const c of rows) {
    const s = c.memory_json?.sentiment;
    if (s && s in bySentiment) bySentiment[s as keyof typeof bySentiment]++;
  }

  const TABS = [
    { key: 'all',       label: 'All',        count: null },
    { key: 'positive',  label: 'Positive',   count: bySentiment.positive   },
    { key: 'neutral',   label: 'Neutral',    count: bySentiment.neutral    },
    { key: 'negative',  label: 'Negative',   count: bySentiment.negative   },
    { key: 'frustrated',label: 'Frustrated', count: bySentiment.frustrated },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Contacts</h1>
        <p className="text-sm text-slate-500 mt-1">All customers who have messaged your bot</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Users size={18} className="text-emerald-600" />}
          label="Total Contacts"
          value={rows.length}
          bg="bg-emerald-50"
        />
        <StatCard
          icon={<Clock size={18} className="text-blue-600" />}
          label="Active This Week"
          value={activeThisWeek}
          bg="bg-blue-50"
        />
        <StatCard
          icon={<Star size={18} className="text-amber-500" />}
          label="Positive Sentiment"
          value={bySentiment.positive}
          bg="bg-amber-50"
        />
        <StatCard
          icon={<AlertCircle size={18} className="text-red-500" />}
          label="Frustrated"
          value={bySentiment.frustrated}
          bg="bg-red-50"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <form method="GET" className="relative flex-1 max-w-xs">
          {/* preserve sentiment filter in form */}
          {sentimentFilter !== 'all' && (
            <input type="hidden" name="sentiment" value={sentimentFilter} />
          )}
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            name="q"
            defaultValue={search}
            placeholder="Search by name or phone…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400"
          />
        </form>

        {/* Sentiment tabs */}
        <div className="flex gap-1 flex-wrap">
          {TABS.map(tab => {
            const params = new URLSearchParams();
            if (tab.key !== 'all') params.set('sentiment', tab.key);
            if (search.trim()) params.set('q', search.trim());
            const href = `/contacts${params.toString() ? `?${params}` : ''}`;
            const active = sentimentFilter === tab.key || (tab.key === 'all' && sentimentFilter === 'all');
            return (
              <Link
                key={tab.key}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
                }`}
              >
                {tab.label}
                {tab.count !== null && tab.count > 0 && (
                  <span className={`ml-1.5 ${active ? 'text-emerald-200' : 'text-slate-400'}`}>
                    {tab.count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Contact list */}
      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Users size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No contacts found</p>
          <p className="text-slate-400 text-sm mt-1">
            {search ? 'Try a different search term' : 'Contacts appear once customers message your bot'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {rows.map(contact => {
            const mem = contact.memory_json ?? {};
            const sentiment = mem.sentiment ?? 'neutral';
            const sentimentStyle = SENTIMENT_STYLES[sentiment] ?? SENTIMENT_STYLES.neutral;
            const convos = contact.conversations ?? [];
            const openIssues = mem.open_issues ?? [];
            const preferences = mem.preferences ?? {};
            const prefEntries = Object.entries(preferences).slice(0, 3);
            const latestConvoId = convos
              .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]?.id;

            return (
              <div key={contact.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50/70 transition-colors">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 text-emerald-700 font-semibold text-sm">
                  {contactDisplayName(contact).charAt(0).toUpperCase()}
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 text-sm">{contactDisplayName(contact)}</span>
                    {/* Sentiment badge */}
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sentimentStyle.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sentimentStyle.dot}`} />
                      {sentimentStyle.label}
                    </span>
                    {mem.awaiting_csat && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 ring-1 ring-purple-200">
                        CSAT pending
                      </span>
                    )}
                    {mem.csat_score !== undefined && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                        CSAT {mem.csat_score}/5
                      </span>
                    )}
                  </div>

                  {/* Phone */}
                  {contact.phone && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Phone size={11} className="text-slate-400" />
                      <span className="text-xs text-slate-500">{contact.phone}</span>
                    </div>
                  )}

                  {/* Captured entities / preferences */}
                  {prefEntries.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {prefEntries.map(([k, v]) => (
                        <span key={k} className="px-2 py-0.5 rounded-md text-xs bg-slate-100 text-slate-600">
                          <span className="text-slate-400">{k}:</span> {v}
                        </span>
                      ))}
                      {Object.keys(preferences).length > 3 && (
                        <span className="px-2 py-0.5 rounded-md text-xs bg-slate-100 text-slate-400">
                          +{Object.keys(preferences).length - 3} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Open issues */}
                  {openIssues.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <AlertCircle size={11} className="text-orange-400 shrink-0" />
                      <span className="text-xs text-orange-600 truncate">{openIssues[0]}</span>
                      {openIssues.length > 1 && (
                        <span className="text-xs text-slate-400">+{openIssues.length - 1}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Right column */}
                <div className="shrink-0 flex flex-col items-end gap-1.5 text-right">
                  <span className="text-xs text-slate-400">{formatRelative(contact.updated_at)}</span>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <MessageSquare size={11} className="text-slate-400" />
                    <span>{convos.length} conv{convos.length !== 1 ? 's' : ''}</span>
                  </div>
                  {latestConvoId && (
                    <Link
                      href={`/conversations/${latestConvoId}`}
                      className="text-xs text-emerald-600 hover:text-emerald-700 font-medium hover:underline"
                    >
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
        Showing {rows.length} contact{rows.length !== 1 ? 's' : ''}
        {sentimentFilter !== 'all' ? ` · filtered by ${sentimentFilter}` : ''}
        {search ? ` · matching "${search}"` : ''}
      </p>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold text-slate-900 tabular-nums">{value.toLocaleString()}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}
