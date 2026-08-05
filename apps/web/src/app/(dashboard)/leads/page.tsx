import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  Target,
  TrendingUp,
  CheckCircle,
  Clock,
  MessageSquare,
  Phone,
  User,
} from 'lucide-react';

type SearchParams = Promise<{ stage?: string }>;

type LeadEscalation = {
  id: string;
  trigger_reason: string;
  status: string;
  created_at: string;
};

type LeadContact = {
  id: string;
  phone: string | null;
  name: string | null;
  memory_json: {
    preferences?: Record<string, string>;
    order_history?: string[];
    sentiment?: string;
  } | null;
};

type LeadConversation = {
  id: string;
  stage: string | null;
  ai_vars: Record<string, string> | null;
  status: string;
  updated_at: string;
  product_type: string;
  contacts: LeadContact | null;
  escalations: LeadEscalation[];
};

const STAGE_STYLES: Record<string, { label: string; badge: string; dot: string }> = {
  qualifying:  { label: 'Qualifying',  badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',   dot: 'bg-blue-400'   },
  resolving:   { label: 'Proposing',   badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200', dot: 'bg-violet-400' },
  'following-up': { label: 'Following Up', badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', dot: 'bg-amber-400' },
  closing:     { label: 'Closing',     badge: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200', dot: 'bg-orange-400' },
  resolved:    { label: 'Converted',   badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-400' },
};

const DEFAULT_STAGE = { label: 'New Lead', badge: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200', dot: 'bg-slate-300' };

function formatRelative(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days < 7)    return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function contactDisplayName(c: LeadContact | null): string {
  if (!c) return 'Unknown';
  return c.name ?? c.phone ?? 'Unknown';
}

function extractLeadEntities(
  aiVars: Record<string, string> | null,
  preferences: Record<string, string> | undefined
): Array<{ key: string; value: string }> {
  const entities: Array<{ key: string; value: string }> = [];
  const source = { ...(aiVars ?? {}), ...(preferences ?? {}) };
  for (const [k, v] of Object.entries(source)) {
    if (v && String(v).trim()) {
      entities.push({ key: k.replace(/_/g, ' '), value: String(v).slice(0, 40) });
    }
    if (entities.length >= 4) break;
  }
  return entities;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { stage: stageFilter = 'all' } = await searchParams;

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

  // Fetch all sales_bot conversations with their escalations and contact
  const { data: rawConvos } = await admin
    .from('conversations')
    .select(`
      id, stage, ai_vars, status, updated_at, product_type,
      contacts(id, phone, name, memory_json),
      escalations(id, trigger_reason, status, created_at)
    `)
    .eq('tenant_id', tenantId)
    .eq('product_type', 'sales_bot')
    .order('updated_at', { ascending: false })
    .limit(300);

  const allConvos = (rawConvos ?? []) as unknown as LeadConversation[];

  // Filter to conversations that have at least one SALES_LEAD escalation
  const leads = allConvos.filter(c =>
    (c.escalations ?? []).some(e =>
      e.trigger_reason?.toLowerCase().includes('sales lead') ||
      e.trigger_reason?.includes('[SALES_LEAD]')
    )
  );

  // Apply stage filter
  const filtered = stageFilter === 'all'
    ? leads
    : leads.filter(c => {
        const s = c.stage?.toLowerCase() ?? '';
        if (stageFilter === 'converted') return c.status === 'resolved';
        return s.includes(stageFilter);
      });

  // Stats
  const total     = leads.length;
  const active    = leads.filter(c => c.status !== 'resolved').length;
  const converted = leads.filter(c => c.status === 'resolved').length;
  const convRate  = total > 0 ? Math.round((converted / total) * 100) : 0;

  const TABS = [
    { key: 'all',          label: 'All Leads', count: total      },
    { key: 'qualifying',   label: 'Qualifying',     count: leads.filter(c => c.stage?.toLowerCase().includes('qualifying')).length      },
    { key: 'closing',      label: 'Closing',        count: leads.filter(c => c.stage?.toLowerCase().includes('closing')).length         },
    { key: 'converted',    label: 'Converted',      count: converted },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sales Leads</h1>
        <p className="text-sm text-slate-500 mt-1">Contacts flagged as sales opportunities by your bot</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Target size={18} className="text-violet-600" />}
          label="Total Leads"
          value={total}
          bg="bg-violet-50"
        />
        <StatCard
          icon={<TrendingUp size={18} className="text-blue-600" />}
          label="Active"
          value={active}
          bg="bg-blue-50"
        />
        <StatCard
          icon={<CheckCircle size={18} className="text-emerald-600" />}
          label="Converted"
          value={converted}
          bg="bg-emerald-50"
        />
        <StatCard
          icon={<Clock size={18} className="text-amber-500" />}
          label="Conversion Rate"
          value={`${convRate}%`}
          bg="bg-amber-50"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map(tab => {
          const params = tab.key !== 'all' ? `?stage=${tab.key}` : '';
          const active = stageFilter === tab.key || (tab.key === 'all' && stageFilter === 'all');
          return (
            <Link
              key={tab.key}
              href={`/leads${params}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                active
                  ? 'bg-violet-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-violet-300 hover:text-violet-700'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1.5 ${active ? 'text-violet-200' : 'text-slate-400'}`}>{tab.count}</span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Leads list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Target size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No leads found</p>
          <p className="text-slate-400 text-sm mt-1">
            {stageFilter !== 'all'
              ? 'No leads in this stage yet'
              : 'Leads appear when the bot flags a customer with [SALES_LEAD]'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {filtered.map(lead => {
            const contact  = lead.contacts;
            const rawStage = lead.stage?.toLowerCase() ?? '';
            const stageKey = Object.keys(STAGE_STYLES).find(k => rawStage.includes(k))
              ?? (lead.status === 'resolved' ? 'resolved' : '');
            const stageStyle = STAGE_STYLES[stageKey] ?? DEFAULT_STAGE;

            const entities = extractLeadEntities(
              lead.ai_vars,
              (contact?.memory_json?.preferences) ?? undefined
            );

            // Latest SALES_LEAD escalation
            const salesEsc = [...(lead.escalations ?? [])]
              .filter(e =>
                e.trigger_reason?.toLowerCase().includes('sales lead') ||
                e.trigger_reason?.includes('[SALES_LEAD]')
              )
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

            const displayName = contactDisplayName(contact);

            return (
              <div key={lead.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50/70 transition-colors">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center shrink-0 text-violet-700 font-semibold text-sm">
                  {displayName.charAt(0).toUpperCase()}
                </div>

                {/* Main */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 text-sm">{displayName}</span>
                    {/* Stage badge */}
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${stageStyle.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${stageStyle.dot}`} />
                      {stageStyle.label}
                    </span>
                  </div>

                  {contact?.phone && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Phone size={11} className="text-slate-400" />
                      <span className="text-xs text-slate-500">{contact.phone}</span>
                    </div>
                  )}

                  {/* Trigger reason */}
                  {salesEsc && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                      <span className="text-slate-400">Lead reason: </span>
                      {salesEsc.trigger_reason
                        .replace(/\[SALES_LEAD\]/gi, '')
                        .replace(/\[STAGE:[^\]]+\]/gi, '')
                        .trim() || 'Sales opportunity detected'}
                    </p>
                  )}

                  {/* Captured entities */}
                  {entities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {entities.map(({ key, value }) => (
                        <span key={key} className="px-2 py-0.5 rounded-md text-xs bg-violet-50 text-violet-700">
                          <span className="text-violet-400">{key}:</span> {value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right */}
                <div className="shrink-0 flex flex-col items-end gap-1.5 text-right">
                  <span className="text-xs text-slate-400">{formatRelative(lead.updated_at)}</span>
                  {salesEsc && (
                    <span className="text-xs text-slate-400">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${
                        salesEsc.status === 'resolved'
                          ? 'bg-emerald-50 text-emerald-600'
                          : salesEsc.status === 'assigned'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-amber-50 text-amber-600'
                      }`}>
                        {salesEsc.status}
                      </span>
                    </span>
                  )}
                  <Link
                    href={`/conversations/${lead.id}`}
                    className="text-xs text-violet-600 hover:text-violet-700 font-medium hover:underline"
                  >
                    View chat →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 text-center">
        Showing {filtered.length} lead{filtered.length !== 1 ? 's' : ''}
        {stageFilter !== 'all' ? ` · ${stageFilter}` : ''}
        {' '}· {convRate}% conversion rate
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
  value: number | string;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold text-slate-900 tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}
