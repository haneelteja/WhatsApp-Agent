export const dynamic = 'force-dynamic';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient }  from '@/lib/supabase/admin';
import { redirect, notFound }      from 'next/navigation';
import Link                        from 'next/link';
import { ArrowLeft, Users, Bot }   from 'lucide-react';
import { GroupMemberActions }      from '@/components/dashboard/GroupMemberActions';
import { GroupDeleteButton }       from '@/components/dashboard/GroupDeleteButton';

type MemberRow = {
  id:        string;
  contact_id: string;
  added_by:  string;
  ai_reason: string | null;
  added_at:  string;
  contacts: {
    id:          string;
    name:        string | null;
    phone:       string | null;
    memory_json: { sentiment?: string } | null;
  } | null;
};

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenantUser } = await admin
    .from('tenant_users').select('tenant_id').eq('user_id', user.id).single();
  const tenantId = tenantUser?.tenant_id ?? '';

  const [{ data: group }, { data: members }] = await Promise.all([
    admin.from('contact_groups').select('*').eq('id', id).eq('tenant_id', tenantId).single(),
    admin.from('contact_group_members')
      .select('id, contact_id, added_by, ai_reason, added_at, contacts(id, name, phone, memory_json)')
      .eq('group_id', id)
      .eq('tenant_id', tenantId)
      .order('added_at', { ascending: false }),
  ]);

  if (!group) notFound();

  const g           = group as { id: string; name: string; description: string | null; color: string; emoji: string };
  const memberList  = (members ?? []) as MemberRow[];

  const SENTIMENT_DOT: Record<string, string> = {
    positive: 'bg-emerald-400', neutral: 'bg-slate-300', negative: 'bg-orange-400', frustrated: 'bg-red-400',
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/groups" className="mt-0.5 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={16} className="text-gray-500" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 shadow-sm"
              style={{ backgroundColor: g.color + '20', border: `1px solid ${g.color}40` }}
            >
              {g.emoji}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{g.name}</h2>
              {g.description && <p className="text-sm text-gray-500 mt-0.5">{g.description}</p>}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span
                className="text-xs font-semibold px-3 py-1 rounded-full"
                style={{ backgroundColor: g.color + '15', color: g.color }}
              >
                {memberList.length} contact{memberList.length !== 1 ? 's' : ''}
              </span>
              <GroupDeleteButton groupId={g.id} groupName={g.name} />
            </div>
          </div>
        </div>
      </div>

      {/* Members list */}
      <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-green-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Users size={14} />
            Members
          </h3>
          <span className="text-xs text-gray-400">{memberList.length} total</span>
        </div>

        {memberList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Users size={24} className="text-gray-200" />
            <p className="text-sm text-gray-400">No contacts in this group yet.</p>
            <p className="text-xs text-gray-300">Go to Contacts and use "Add to group" or the AI suggest button.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {memberList.map(m => {
              const c = m.contacts;
              const displayName = c?.name ?? c?.phone ?? 'Unknown';
              const sentiment   = (c?.memory_json as { sentiment?: string } | null)?.sentiment;
              return (
                <div key={m.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm shrink-0">
                    {displayName[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800 truncate">{displayName}</p>
                      {sentiment && (
                        <span className={`w-2 h-2 rounded-full shrink-0 ${SENTIMENT_DOT[sentiment] ?? 'bg-slate-300'}`} title={sentiment} />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {m.added_by === 'ai' ? (
                        <span className="flex items-center gap-1 text-[10px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full font-medium">
                          <Bot size={9} /> AI added
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">Added manually</span>
                      )}
                      {m.ai_reason && (
                        <span className="text-[10px] text-gray-400 truncate max-w-[200px]" title={m.ai_reason}>
                          · {m.ai_reason}
                        </span>
                      )}
                    </div>
                  </div>
                  {c?.id && (
                    <GroupMemberActions contactId={c.id} groupId={g.id} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
