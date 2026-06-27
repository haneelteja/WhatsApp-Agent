import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';

interface Props {
  params: { paymentId: string };
}

export default async function PaymentStatusPage({ params }: Props) {
  const admin = getSupabaseAdminClient();

  const { data: payment } = await admin
    .from('payments')
    .select('status, webhook_received_at, order_id, orders(total, status)')
    .eq('id', params.paymentId)
    .maybeSingle();

  const order = payment
    ? (payment as unknown as { orders: { total: number; status: string } | null }).orders
    : null;

  if (!payment) {
    return (
      <StatusShell>
        <XCircle size={48} className="text-slate-300 mx-auto" />
        <h1 className="text-xl font-bold text-slate-700 mt-4">Payment not found</h1>
        <p className="text-sm text-slate-400 mt-1">This link may be invalid or expired.</p>
      </StatusShell>
    );
  }

  if (payment.status === 'paid') {
    return (
      <StatusShell>
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <CheckCircle2 size={32} className="text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mt-4">Payment Successful!</h1>
        {order && (
          <p className="text-sm text-slate-500 mt-1">
            ₹{Number(order.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })} received
          </p>
        )}
        <p className="text-sm text-slate-500 mt-3">
          Your order is confirmed and being processed. You&apos;ll receive updates on WhatsApp.
        </p>
        <div className="mt-6 px-4 py-3 bg-emerald-50 rounded-xl border border-emerald-100 text-xs text-emerald-700 font-medium">
          Payment confirmed {payment.webhook_received_at
            ? `on ${new Date(payment.webhook_received_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
            : ''}
        </div>
      </StatusShell>
    );
  }

  if (payment.status === 'failed') {
    return (
      <StatusShell>
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <XCircle size={32} className="text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mt-4">Payment Failed</h1>
        <p className="text-sm text-slate-500 mt-1">
          Your payment could not be processed. No amount has been charged.
        </p>
        <p className="text-sm text-slate-500 mt-3">
          Please try again or contact us on WhatsApp for assistance.
        </p>
      </StatusShell>
    );
  }

  if (payment.status === 'expired') {
    return (
      <StatusShell>
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
          <Clock size={32} className="text-slate-400" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mt-4">Payment Link Expired</h1>
        <p className="text-sm text-slate-500 mt-1">
          This payment link is no longer valid.
        </p>
        <p className="text-sm text-slate-500 mt-3">
          Please contact us on WhatsApp to receive a new payment link.
        </p>
      </StatusShell>
    );
  }

  // status === 'pending' — payment still being processed
  return (
    <StatusShell>
      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto animate-pulse">
        <RefreshCw size={28} className="text-amber-500" />
      </div>
      <h1 className="text-2xl font-bold text-slate-800 mt-4">Processing Payment…</h1>
      {order && (
        <p className="text-sm text-slate-500 mt-1">
          ₹{Number(order.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </p>
      )}
      <p className="text-sm text-slate-500 mt-3">
        Your payment is being confirmed. This usually takes a few seconds.
      </p>
      <PendingRefresh />
    </StatusShell>
  );
}

function StatusShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-100 shadow-sm p-8 text-center">
        {children}
        <p className="text-[11px] text-slate-300 mt-8">Powered by Alphabot</p>
      </div>
    </div>
  );
}

// Client component for auto-refresh on pending
import AutoRefresh from './AutoRefresh';
function PendingRefresh() {
  return <AutoRefresh />;
}
