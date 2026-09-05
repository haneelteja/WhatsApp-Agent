import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { ReturnRequestCard } from '@/components/dashboard/ReturnRequestCard';
import type { ReturnRequest } from '@/app/actions/returns';

type SearchParams = Promise<{ status?: string }>;

export default async function ReturnsPage({ searchParams }: { searchParams: SearchParams }) {
  const { status: filterStatus } = await searchParams;

  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  const tenantId = tenantUser?.tenant_id ?? '';

  let query = admin
    .from('return_requests')
    .select(`
      id, type, reason, status, staff_notes, created_at,
      contact:contacts(name, phone),
      order:orders(id, total_amount)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (filterStatus && filterStatus !== 'all') {
    query = query.eq('status', filterStatus);
  }

  const { data: requests } = await query.limit(100);

  const STATUSES = ['all', 'pending', 'approved', 'rejected', 'completed'];

  const counts = (requests ?? []).reduce<Record<string, number>>((acc, r) => {
    const s = (r as { status: string }).status;
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-orange-50 rounded-lg">
          <RotateCcw size={18} className="text-orange-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Return Requests</h1>
          <p className="text-sm text-slate-500">Review and process customer return and replacement requests</p>
        </div>
        <span className="ml-auto text-sm text-slate-500 font-medium">
          {(requests ?? []).length} request{(requests ?? []).length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1.5 flex-wrap mb-6">
        {STATUSES.map(s => {
          const isActive = (filterStatus ?? 'all') === s;
          const count    = s === 'all' ? (requests ?? []).length : (counts[s] ?? 0);
          return (
            <a
              key={s}
              href={s === 'all' ? '/returns' : `/returns?status=${s}`}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
            </a>
          );
        })}
      </div>

      {/* Request list */}
      {(requests ?? []).length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <RotateCcw size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No return requests</p>
          <p className="text-xs mt-1">They&apos;ll appear here when customers request returns via WhatsApp</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {(requests as unknown as ReturnRequest[]).map(r => (
            <ReturnRequestCard key={r.id} request={r} />
          ))}
        </div>
      )}
    </div>
  );
}
