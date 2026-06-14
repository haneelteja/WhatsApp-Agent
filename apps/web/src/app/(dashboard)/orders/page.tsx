import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ShoppingCart, Plus, ExternalLink, CheckCircle, Clock, Truck, XCircle, Package } from 'lucide-react';
import { OrderStatusBadge } from '@/components/dashboard/OrderStatusBadge';

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending:    <Clock size={13} className="text-amber-500" />,
  confirmed:  <CheckCircle size={13} className="text-emerald-500" />,
  dispatched: <Truck size={13} className="text-indigo-500" />,
  delivered:  <Package size={13} className="text-slate-400" />,
  cancelled:  <XCircle size={13} className="text-red-400" />,
};

const PAYMENT_BADGE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  paid:    'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed:  'bg-red-50 text-red-700 ring-red-200',
  expired: 'bg-slate-100 text-slate-500 ring-slate-200',
};

type SearchParams = Promise<{ status?: string }>;

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
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
    .from('orders')
    .select(`
      id, total, status, created_at, updated_at, items_json,
      contact:contacts(phone, name),
      payments(id, status, link_url, webhook_received_at)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (filterStatus && filterStatus !== 'all') {
    query = query.eq('status', filterStatus);
  }

  const { data: orders } = await query.limit(100);

  const STATUSES = ['all', 'pending', 'confirmed', 'dispatched', 'delivered', 'cancelled'];

  const totals = {
    all:        orders?.length ?? 0,
    pending:    orders?.filter(o => o.status === 'pending').length   ?? 0,
    confirmed:  orders?.filter(o => o.status === 'confirmed').length ?? 0,
    paid:       orders?.filter(o => (o.payments as Array<{ status: string }>)?.[0]?.status === 'paid').length ?? 0,
  };

  const totalRevenue = orders
    ?.filter(o => (o.payments as Array<{ status: string }>)?.[0]?.status === 'paid')
    .reduce((sum, o) => sum + Number(o.total), 0) ?? 0;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Orders</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage customer orders and payment links</p>
        </div>
        <Link
          href="/orders/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
        >
          <Plus size={14} />
          New Order
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Orders', value: totals.all,       color: 'text-slate-800'   },
          { label: 'Pending',      value: totals.pending,   color: 'text-amber-600'   },
          { label: 'Confirmed',    value: totals.confirmed, color: 'text-emerald-600' },
          { label: 'Revenue (₹)',  value: `₹${totalRevenue.toLocaleString('en-IN')}`, color: 'text-indigo-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-green-100 rounded-xl p-4">
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUSES.map(s => (
          <Link
            key={s}
            href={s === 'all' ? '/orders' : `/orders?status=${s}`}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors capitalize ${
              (s === 'all' && !filterStatus) || filterStatus === s
                ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      {/* Orders list */}
      <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
        {!orders?.length ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <ShoppingCart size={28} className="text-slate-200" />
            <p className="text-sm text-slate-400">No orders yet.</p>
            <Link href="/orders/new" className="text-xs font-semibold text-emerald-600 hover:text-emerald-800">
              Create your first order →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {orders.map(order => {
              const contact  = order.contact as unknown as { phone: string; name: string | null } | null;
              const payment  = (order.payments as Array<{ id: string; status: string; link_url: string | null; webhook_received_at: string | null }>)?.[0];
              const items    = (order.items_json as Array<{ name: string; quantity: number; price: number }>) ?? [];

              return (
                <div key={order.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="shrink-0">{STATUS_ICON[order.status]}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {contact?.name ?? contact?.phone ?? '—'}
                      </p>
                      <span className="text-[10px] text-slate-400 font-mono">{order.id.slice(0, 8)}</span>
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {items.slice(0, 2).map(i => `${i.name} ×${i.quantity}`).join(', ')}
                      {items.length > 2 ? ` +${items.length - 2} more` : ''}
                    </p>
                    <p className="text-[10px] text-slate-300 mt-0.5">
                      {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <p className="text-sm font-bold text-slate-800 tabular-nums">₹{Number(order.total).toLocaleString('en-IN')}</p>

                    {payment && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 capitalize ${PAYMENT_BADGE[payment.status] ?? PAYMENT_BADGE.pending}`}>
                        {payment.status}
                      </span>
                    )}

                    <OrderStatusBadge orderId={order.id} currentStatus={order.status as 'pending' | 'confirmed' | 'dispatched' | 'delivered' | 'cancelled'} />

                    {payment?.link_url && payment.status !== 'paid' && (
                      <a
                        href={payment.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open payment link"
                        className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
