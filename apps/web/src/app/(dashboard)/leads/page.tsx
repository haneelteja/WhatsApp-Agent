import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  Target,
  TrendingUp,
  CheckCircle,
  Clock,
  Zap,
} from 'lucide-react';
import { LeadsBoard } from '@/components/leads/LeadsBoard';
import type { LeadData } from '@/components/leads/LeadsBoard';
import { SalesAnalytics } from '@/components/leads/SalesAnalytics';
import type { SalesAnalyticsData } from '@/components/leads/SalesAnalytics';

// ── Analytics helpers ─────────────────────────────────────────────────────────

function buildAnalytics(leads: LeadData[]): SalesAnalyticsData {
  const total     = leads.length;
  const converted = leads.filter(l => l.status === 'resolved').length;

  // Stage funnel — order matches sales progression
  const FUNNEL_STAGES = [
    { key: 'qualifying',   label: 'Qualifying',   color: 'bg-blue-400',    text: 'text-blue-900' },
    { key: 'resolving',    label: 'Proposing',    color: 'bg-violet-400',  text: 'text-violet-900' },
    { key: 'following_up', label: 'Following Up', color: 'bg-amber-400',   text: 'text-amber-900' },
    { key: 'closing',      label: 'Closing',      color: 'bg-orange-400',  text: 'text-orange-900' },
    { key: 'converted',    label: 'Converted',    color: 'bg-emerald-500', text: 'text-emerald-900' },
  ];

  const stageCounts: Record<string, number> = {
    qualifying:   0,
    resolving:    0,
    following_up: 0,
    closing:      0,
    converted:    0,
  };

  for (const l of leads) {
    if (l.status === 'resolved') {
      stageCounts['converted']++;
    } else if (l.stage && l.stage in stageCounts) {
      stageCounts[l.stage]++;
    } else {
      stageCounts['qualifying']++;
    }
  }

  const funnel = FUNNEL_STAGES.map((s, i) => {
    const count = stageCounts[s.key] ?? 0;
    const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
    const prevCount = i === 0 ? total : (stageCounts[FUNNEL_STAGES[i - 1].key] ?? 0);
    const dropPct = prevCount > 0 && i > 0
      ? Math.round(((prevCount - count) / prevCount) * 100)
      : 0;
    return { ...s, count, pct, dropPct };
  });

  // Weekly new leads — last 8 weeks using escalation created_at
  const now = Date.now();
  const weeklyNew = Array.from({ length: 8 }, (_, i) => {
    const weekStart = now - (7 - i) * 7 * 86_400_000;
    const weekEnd   = now - (6 - i) * 7 * 86_400_000;
    const weekLabel = new Date(weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const count = leads.filter(l => {
      const earliest = l.escalations
        .map(e => new Date(e.created_at).getTime())
        .sort((a, b) => a - b)[0];
      return earliest !== undefined && earliest >= weekStart && earliest < weekEnd;
    }).length;
    return { label: weekLabel, count };
  });

  // Avg close days — converted leads only
  const closeTimes = leads
    .filter(l => l.status === 'resolved')
    .map(l => {
      const earliest = l.escalations
        .map(e => new Date(e.created_at).getTime())
        .sort((a, b) => a - b)[0];
      if (earliest === undefined) return null;
      return (new Date(l.updated_at).getTime() - earliest) / 86_400_000;
    })
    .filter((d): d is number => d !== null && d >= 0);

  const avgCloseDays = closeTimes.length > 0
    ? Math.round(closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length)
    : null;

  return { funnel, weeklyNew, avgCloseDays, totalLeads: total, convertedLeads: converted };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function LeadsPage() {
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

  const { data: rawConvos } = await admin
    .from('conversations')
    .select(`
      id, stage, ai_vars, status, updated_at, product_type,
      lead_score, lead_follow_up_count, intent_signals, intent_reasoning,
      contacts(id, phone, name, memory_json),
      escalations(id, trigger_reason, status, created_at, ai_summary)
    `)
    .eq('tenant_id', tenantId)
    .eq('product_type', 'sales_bot')
    .order('updated_at', { ascending: false })
    .limit(300);

  const allConvos = (rawConvos ?? []) as unknown as LeadData[];

  // Only conversations that have at least one SALES_LEAD escalation
  const leads = allConvos.filter(c =>
    (c.escalations ?? []).some(e =>
      e.trigger_reason?.toLowerCase().includes('sales lead') ||
      e.trigger_reason?.includes('[SALES_LEAD]')
    )
  );

  const total     = leads.length;
  const active    = leads.filter(c => c.status !== 'resolved').length;
  const converted = leads.filter(c => c.status === 'resolved').length;
  const convRate  = total > 0 ? Math.round((converted / total) * 100) : 0;
  const avgScore  = total > 0
    ? Math.round(leads.reduce((s, l) => s + ((l as unknown as { lead_score: number }).lead_score ?? 0), 0) / total)
    : 0;

  const analyticsData = buildAnalytics(leads);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sales Pipeline</h1>
        <p className="text-sm text-slate-500 mt-1">
          Contacts flagged as sales opportunities · drag cards between stages or use the stage selector
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={<Target size={18} className="text-violet-600" />}       label="Total Leads"     value={total}          bg="bg-violet-50" />
        <StatCard icon={<TrendingUp size={18} className="text-blue-600" />}     label="Active"          value={active}         bg="bg-blue-50" />
        <StatCard icon={<CheckCircle size={18} className="text-emerald-600" />} label="Converted"       value={converted}      bg="bg-emerald-50" />
        <StatCard icon={<Clock size={18} className="text-amber-500" />}         label="Conversion Rate" value={`${convRate}%`} bg="bg-amber-50" />
        <StatCard icon={<Zap size={18} className="text-orange-500" />}          label="Avg Lead Score"  value={`${avgScore}/100`} bg="bg-orange-50" />
      </div>

      {/* Analytics */}
      <SalesAnalytics data={analyticsData} />

      {/* Interactive board (client component) */}
      <LeadsBoard initialLeads={leads} />
    </div>
  );
}

function StatCard({
  icon, label, value, bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}>{icon}</div>
      <div>
        <p className="text-xl font-bold text-slate-900 tabular-nums">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}
