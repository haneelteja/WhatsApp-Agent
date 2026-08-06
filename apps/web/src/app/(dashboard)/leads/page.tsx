import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  Target,
  TrendingUp,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { LeadsBoard } from '@/components/leads/LeadsBoard';
import type { LeadData } from '@/components/leads/LeadsBoard';

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
      contacts(id, phone, name, memory_json),
      escalations(id, trigger_reason, status, created_at)
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Target size={18} className="text-violet-600" />}  label="Total Leads"      value={total}       bg="bg-violet-50" />
        <StatCard icon={<TrendingUp size={18} className="text-blue-600" />} label="Active"           value={active}      bg="bg-blue-50" />
        <StatCard icon={<CheckCircle size={18} className="text-emerald-600" />} label="Converted"    value={converted}   bg="bg-emerald-50" />
        <StatCard icon={<Clock size={18} className="text-amber-500" />}    label="Conversion Rate"  value={`${convRate}%`} bg="bg-amber-50" />
      </div>

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
