import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { getAuditLogsAction } from '@/app/actions/audit';
import { AuditLogTable } from '@/components/platform/AuditLogTable';

export const metadata = { title: 'Audit Log — Platform Console' };

export default async function PlatformAuditPage() {
  // Manager-only gate
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) redirect('/login');

  const admin = getSupabaseAdminClient();
  const { data: puRow } = await admin
    .from('platform_users')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (puRow?.role !== 'manager') {
    redirect('/platform/clients');
  }

  const { logs, error } = await getAuditLogsAction(null, 500);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
          <ClipboardList size={18} className="text-indigo-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Platform Audit Log</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            All actions taken by platform managers across all clients — last 500 events.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        {error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : (
          <AuditLogTable logs={logs} showTenant={true} />
        )}
      </div>
    </div>
  );
}
