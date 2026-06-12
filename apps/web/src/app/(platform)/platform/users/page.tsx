import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { Users, Shield } from 'lucide-react';
import { InvitePlatformUserForm } from '@/components/platform/InvitePlatformUserForm';
import { PlatformUserActions } from '@/components/platform/PlatformUserActions';

const ROLE_BADGE: Record<string, string> = {
  manager: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
  admin:   'bg-slate-100 text-slate-600 border border-slate-200',
};

const ROLE_LABEL: Record<string, string> = {
  manager: 'Manager',
  admin:   'Admin',
};

export default async function PlatformTeamPage() {
  const admin  = getSupabaseAdminClient();
  const server = await getSupabaseServerClient();

  const { data: { user: currentUser } } = await server.auth.getUser();

  const [
    { data: platformUsers },
    { data: { users: authUsers } },
  ] = await Promise.all([
    admin.from('platform_users').select('id, user_id, role, name, created_at').order('created_at'),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const emailMap = new Map(authUsers.map(u => [u.id, u.email ?? '']));
  const lastSignInMap = new Map(authUsers.map(u => [u.id, u.last_sign_in_at ?? null]));

  const members = (platformUsers ?? []).map(p => ({
    ...p,
    email:      emailMap.get(p.user_id) ?? '—',
    lastSignIn: lastSignInMap.get(p.user_id) ?? null,
    isSelf:     p.user_id === currentUser?.id,
  }));

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Platform Team</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Manage who has access to the platform console.
        </p>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { role: 'admin',   desc: 'View and configure all platform settings, clients, and bots.' },
          { role: 'manager', desc: 'Everything Admin can do, plus invite platform team members.' },
        ].map(r => (
          <div key={r.role} className="bg-white border border-slate-100 rounded-xl p-4 space-y-1.5 shadow-sm">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE[r.role]}`}>
              {ROLE_LABEL[r.role]}
            </span>
            <p className="text-xs text-slate-500">{r.desc}</p>
          </div>
        ))}
      </div>

      {/* Invite form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100 bg-slate-50/60">
          <Users size={14} className="text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-800">Invite Team Member</h3>
        </div>
        <div className="px-5 py-5">
          <InvitePlatformUserForm />
        </div>
      </div>

      {/* Team table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <Shield size={14} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-800">Team Members</h3>
          </div>
          <span className="text-xs text-slate-400 font-medium">{members.length} member{members.length !== 1 ? 's' : ''}</span>
        </div>

        {members.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-400">No platform users found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-50">
                  {['Member', 'Role', 'Last Sign In', 'Joined', ''].map(h => (
                    <th key={h} className="text-left px-4 first:px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {members.map(m => {
                  const initials = m.name
                    ? m.name.slice(0, 2).toUpperCase()
                    : m.email.slice(0, 2).toUpperCase();
                  const joinedAt = new Date(m.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  });
                  const lastSeen = m.lastSignIn
                    ? new Date(m.lastSignIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : 'Never';

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-600 font-bold text-xs shrink-0">
                            {initials}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 leading-tight">{m.name || m.email.split('@')[0]}</p>
                            <p className="text-[11px] text-slate-400">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE[m.role] ?? ROLE_BADGE.admin}`}>
                          {ROLE_LABEL[m.role] ?? m.role}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-400 whitespace-nowrap">{lastSeen}</td>
                      <td className="px-4 py-4 text-xs text-slate-400 whitespace-nowrap">{joinedAt}</td>
                      <td className="px-4 py-4 text-right">
                        <PlatformUserActions
                          userId={m.user_id}
                          currentRole={m.role as 'manager' | 'admin'}
                          isSelf={m.isSelf}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
