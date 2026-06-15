import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Users, Mail, Trash2, Clock } from 'lucide-react';
import { TeamInviteForm } from '@/components/dashboard/TeamInviteForm';
import { removeTeamMemberAction } from '@/app/actions/tenant-team';

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin:          { label: 'Admin',      color: 'bg-violet-50 text-violet-700' },
  client_manager: { label: 'Admin',      color: 'bg-violet-50 text-violet-700' },
  supervisor:     { label: 'Supervisor', color: 'bg-sky-50 text-sky-700' },
  client_admin:   { label: 'Supervisor', color: 'bg-sky-50 text-sky-700' },
  agent:          { label: 'Agent',      color: 'bg-slate-100 text-slate-600' },
};

export default async function TeamPage() {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: callerTU } = await admin
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single();

  if (!callerTU) redirect('/dashboard');
  const tenantId = callerTU.tenant_id;
  const isAdmin  = ['admin', 'client_manager', 'supervisor'].includes(callerTU.role);

  // Fetch team members
  const { data: tenantUsers } = await admin
    .from('tenant_users')
    .select('user_id, role, created_at')
    .eq('tenant_id', tenantId);

  const members = await Promise.all(
    (tenantUsers ?? []).map(async (tu) => {
      const { data: { user: authUser } } = await admin.auth.admin.getUserById(tu.user_id);
      return {
        userId:    tu.user_id,
        role:      tu.role,
        joinedAt:  tu.created_at,
        email:     authUser?.email ?? '—',
        name:      (authUser?.user_metadata?.full_name as string | undefined) ?? null,
        isSelf:    tu.user_id === user.id,
      };
    })
  );

  // Fetch pending invites
  const { data: pendingInvites } = await admin
    .from('client_invites')
    .select('id, email, role, created_at, expires_at')
    .eq('tenant_id', tenantId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false });

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Team</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage your team members and invite new agents
          </p>
        </div>
        <span className="text-xs font-semibold text-gray-500 bg-white border border-green-100 px-3 py-1.5 rounded-full shadow-sm">
          {members.length} member{members.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Invite form — admins/supervisors only */}
      {isAdmin && <TeamInviteForm />}

      {/* Members list */}
      <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Users size={14} />
            Active members
          </h3>
        </div>
        <div className="divide-y divide-slate-50">
          {members.map((m) => {
            const roleMeta = ROLE_LABELS[m.role] ?? { label: m.role, color: 'bg-slate-100 text-slate-600' };
            return (
              <div key={m.userId} className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm shrink-0">
                  {(m.name ?? m.email)[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  {m.name && <p className="text-sm font-semibold text-slate-800 truncate">{m.name}</p>}
                  <p className="text-xs text-slate-500 truncate">{m.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${roleMeta.color}`}>
                    {roleMeta.label}
                  </span>
                  {m.isSelf && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">You</span>
                  )}
                  {isAdmin && !m.isSelf && (
                    <form action={removeTeamMemberAction.bind(null, m.userId) as unknown as (formData: FormData) => Promise<void>}>
                      <button
                        type="submit"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        title="Remove member"
                      >
                        <Trash2 size={13} />
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pending invites */}
      {(pendingInvites?.length ?? 0) > 0 && (
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Clock size={14} />
              Pending invites
            </h3>
          </div>
          <div className="divide-y divide-slate-50">
            {(pendingInvites ?? []).map((inv) => {
              const expired = new Date(inv.expires_at) < new Date();
              const roleMeta = ROLE_LABELS[inv.role] ?? { label: inv.role, color: 'bg-slate-100 text-slate-600' };
              return (
                <div key={inv.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                    <Mail size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{inv.email}</p>
                    <p className={`text-xs mt-0.5 ${expired ? 'text-red-400' : 'text-slate-400'}`}>
                      {expired ? 'Expired' : `Expires ${new Date(inv.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                    </p>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${roleMeta.color}`}>
                    {roleMeta.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
