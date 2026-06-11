import { getSupabaseServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, Building2, CheckCircle2, Clock, XCircle, type LucideIcon } from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; badge: string; Icon: LucideIcon }> = {
  active:    { label: 'Active',    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icon: CheckCircle2 },
  trial:     { label: 'Trial',     badge: 'bg-sky-50 text-sky-700 ring-sky-200',            Icon: Clock },
  suspended: { label: 'Suspended', badge: 'bg-red-50 text-red-700 ring-red-200',            Icon: XCircle },
};

const PLAN_BADGE: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-600',
  growth:  'bg-violet-50 text-violet-600',
  scale:   'bg-amber-50 text-amber-600',
};

const PRODUCT_BADGE: Record<string, { label: string; color: string }> = {
  support_bot:   { label: 'Support',   color: 'bg-sky-50 text-sky-600' },
  sales_bot:     { label: 'Sales',     color: 'bg-violet-50 text-violet-600' },
  lifecycle_bot: { label: 'Lifecycle', color: 'bg-orange-50 text-orange-600' },
};

type TenantProduct = { product_type: string; active: boolean };
type FreeTrial     = { ends_at: string; status: string };
type TenantRow = {
  id: string;
  name: string;
  plan: string;
  status: string;
  created_at: string;
  tenant_products: TenantProduct[];
  free_trials: FreeTrial[];
};

export default async function PlatformClientsPage() {
  const supabase = await getSupabaseServerClient();

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, plan, status, created_at, tenant_products(product_type, active), free_trials(ends_at, status)')
    .order('created_at', { ascending: false });

  const rows = (tenants ?? []) as TenantRow[];
  const counts = {
    total:     rows.length,
    active:    rows.filter(t => t.status === 'active').length,
    trial:     rows.filter(t => t.status === 'trial').length,
    suspended: rows.filter(t => t.status === 'suspended').length,
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Clients</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {counts.total} client{counts.total !== 1 ? 's' : ''} on the platform
          </p>
        </div>
        <Link
          href="/platform/clients/new"
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm shadow-indigo-200"
        >
          <Plus size={15} />
          Add client
        </Link>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(
          [
            { label: 'Total',     value: counts.total,     color: 'text-slate-700',   bg: 'bg-white',       border: 'border-slate-200' },
            { label: 'Active',    value: counts.active,    color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200' },
            { label: 'Trial',     value: counts.trial,     color: 'text-sky-700',     bg: 'bg-sky-50',      border: 'border-sky-200' },
            { label: 'Suspended', value: counts.suspended, color: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200' },
          ] as const
        ).map(s => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-4`}>
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-xs font-medium text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Client table / empty state */}
      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4 border border-indigo-100">
            <Building2 size={24} className="text-indigo-400" />
          </div>
          <p className="text-sm font-semibold text-slate-600">No clients yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">Add your first client to start assigning bots and configuring automations.</p>
          <Link
            href="/platform/clients/new"
            className="mt-4 flex items-center gap-2 bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-xl"
          >
            <Plus size={15} />
            Add client
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  {['Client', 'Status', 'Plan', 'Products', 'Trial', 'Added', ''].map(h => (
                    <th key={h} className="text-left px-4 first:px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(tenant => {
                  const status  = STATUS_CONFIG[tenant.status] ?? STATUS_CONFIG.active;
                  const planBadge = PLAN_BADGE[tenant.plan] ?? PLAN_BADGE.starter;
                  const activeProducts = tenant.tenant_products.filter(p => p.active);
                  const activeTrial = tenant.free_trials.find(t => t.status === 'active');
                  const trialDaysLeft = activeTrial
                    ? Math.max(0, Math.ceil((new Date(activeTrial.ends_at).getTime() - Date.now()) / 86400000))
                    : null;
                  const addedAt = new Date(tenant.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  });

                  return (
                    <tr key={tenant.id} className="hover:bg-slate-50/60 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs shrink-0">
                            {tenant.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 leading-tight">{tenant.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{tenant.id.slice(0, 8)}…</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ring-1 ${status.badge}`}>
                          <status.Icon size={10} />
                          {status.label}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${planBadge}`}>
                          {tenant.plan}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {activeProducts.length === 0 ? (
                            <span className="text-xs text-slate-300">None</span>
                          ) : activeProducts.map(p => {
                            const b = PRODUCT_BADGE[p.product_type];
                            return b ? (
                              <span key={p.product_type} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${b.color}`}>
                                {b.label}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        {trialDaysLeft !== null ? (
                          <span className={`text-xs font-semibold ${trialDaysLeft <= 3 ? 'text-red-600' : 'text-sky-600'}`}>
                            {trialDaysLeft}d left
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>

                      <td className="px-4 py-4 text-xs text-slate-400 whitespace-nowrap">{addedAt}</td>

                      <td className="px-4 py-4 text-right">
                        <Link
                          href={`/platform/clients/${tenant.id}`}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
