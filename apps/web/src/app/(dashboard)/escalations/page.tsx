import { getSupabaseServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';

const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
];

const PRODUCT_LABELS: Record<string, { label: string; color: string }> = {
  support_bot:   { label: 'Support',   color: 'bg-sky-50 text-sky-600' },
  sales_bot:     { label: 'Sales',     color: 'bg-violet-50 text-violet-600' },
  lifecycle_bot: { label: 'Lifecycle', color: 'bg-orange-50 text-orange-600' },
};

export default async function EscalationsPage() {
  const supabase = await getSupabaseServerClient();

  const { data: escalations } = await supabase
    .from('escalations')
    .select('*, conversations(id, product_type, status, contacts(phone, name))')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Escalations</h2>
          <p className="text-sm text-gray-500 mt-0.5">Conversations requiring human agent attention</p>
        </div>
        {!!escalations?.length && (
          <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 px-3 py-1.5 rounded-full">
            {escalations.length} pending
          </span>
        )}
      </div>

      {!escalations?.length ? (
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4 border border-emerald-100">
            <CheckCircle2 size={28} className="text-emerald-500" />
          </div>
          <p className="text-sm font-semibold text-gray-600">All clear</p>
          <p className="text-xs text-gray-400 mt-1">No pending escalations right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {escalations.map((esc) => {
            const conv = esc.conversations as {
              id: string;
              product_type: string;
              status: string;
              contacts: { phone: string; name: string | null } | null;
            } | null;
            const contact     = conv?.contacts;
            const displayName = contact?.name ?? contact?.phone ?? 'Unknown';
            const product     = conv?.product_type ? PRODUCT_LABELS[conv.product_type] : null;
            const colorIdx    = displayName.charCodeAt(0) % AVATAR_COLORS.length;
            const createdAt   = new Date(esc.created_at);
            const diffMins    = Math.floor((Date.now() - createdAt.getTime()) / 60000);
            const timeAgo     =
              diffMins < 1    ? 'Just now' :
              diffMins < 60   ? `${diffMins}m ago` :
              diffMins < 1440 ? `${Math.floor(diffMins / 60)}h ago` :
              `${Math.floor(diffMins / 1440)}d ago`;

            return (
              <div
                key={esc.id}
                className="bg-white rounded-2xl border border-red-100 p-5 flex items-start justify-between gap-4 hover:shadow-md transition-all duration-150"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full ${AVATAR_COLORS[colorIdx]} flex items-center justify-center font-bold text-sm shrink-0 mt-0.5`}>
                    {displayName[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-gray-800">{displayName}</p>
                      {product && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${product.color}`}>
                          {product.label}
                        </span>
                      )}
                    </div>
                    {contact?.phone && (
                      <p className="text-xs text-gray-400">{contact.phone}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-2">
                      <AlertCircle size={12} className="text-red-400 shrink-0" />
                      <p className="text-xs text-red-600 font-medium">{esc.trigger_reason}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-gray-400 whitespace-nowrap">{timeAgo}</span>
                  {conv?.id && (
                    <Link
                      href={`/conversations/${conv.id}`}
                      className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold shadow-sm shadow-emerald-200"
                    >
                      View &amp; Claim
                      <ArrowRight size={12} />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
