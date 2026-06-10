import { getSupabaseServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { AlertCircle, ArrowRight } from 'lucide-react';

export default async function EscalationsPage() {
  const supabase = await getSupabaseServerClient();

  const { data: escalations } = await supabase
    .from('escalations')
    .select('*, conversations(id, product_type, status, contacts(phone, name))')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return (
    <div className="p-6">
      {!escalations?.length ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
            <AlertCircle size={24} className="text-emerald-500" />
          </div>
          <p className="text-sm font-medium text-slate-600">All clear</p>
          <p className="text-xs text-slate-400 mt-1">No pending escalations right now.</p>
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
            const contact = conv?.contacts;
            const displayName = contact?.name ?? contact?.phone ?? 'Unknown';
            const createdAt = new Date(esc.created_at);
            const now = new Date();
            const diffMins = Math.floor((now.getTime() - createdAt.getTime()) / 60000);
            const timeAgo =
              diffMins < 1 ? 'Just now' :
              diffMins < 60 ? `${diffMins}m ago` :
              diffMins < 1440 ? `${Math.floor(diffMins / 60)}h ago` :
              `${Math.floor(diffMins / 1440)}d ago`;

            return (
              <div
                key={esc.id}
                className="bg-white rounded-2xl border border-red-100 p-5 flex items-start justify-between gap-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 font-bold text-sm shrink-0 ring-2 ring-red-100 mt-0.5">
                    {displayName[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{displayName}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{contact?.phone}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <AlertCircle size={12} className="text-red-400 shrink-0" />
                      <p className="text-xs text-red-600 font-medium">{esc.trigger_reason}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-slate-400">{timeAgo}</span>
                  {conv?.id && (
                    <Link
                      href={`/conversations/${conv.id}`}
                      className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium shadow-sm"
                    >
                      View & Claim
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
