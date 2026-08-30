export const dynamic = 'force-dynamic';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient }  from '@/lib/supabase/admin';
import { redirect }                from 'next/navigation';
import Link                        from 'next/link';
import { Users, ChevronRight, Tag } from 'lucide-react';
import { GroupCreateForm }          from '@/components/dashboard/GroupCreateForm';

type GroupRow = {
  id:          string;
  name:        string;
  description: string | null;
  color:       string;
  emoji:       string;
  created_at:  string;
  member_count: number;
};

export default async function GroupsPage() {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenantUser } = await admin
    .from('tenant_users').select('tenant_id').eq('user_id', user.id).single();
  const tenantId = tenantUser?.tenant_id ?? '';

  // Fetch groups with member counts via a joined query
  const { data: groups } = await admin
    .from('contact_groups')
    .select('id, name, description, color, emoji, created_at, contact_group_members(count)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  const groupList: GroupRow[] = (groups ?? []).map((g: {
    id: string; name: string; description: string | null; color: string; emoji: string; created_at: string;
    contact_group_members: Array<{ count: number }> | { count: number };
  }) => ({
    id:          g.id,
    name:        g.name,
    description: g.description,
    color:       g.color,
    emoji:       g.emoji,
    created_at:  g.created_at,
    member_count: Array.isArray(g.contact_group_members)
      ? (g.contact_group_members[0] as unknown as { count: string } | undefined)
          ? parseInt(String((g.contact_group_members[0] as unknown as { count: string }).count), 10)
          : g.contact_group_members.length
      : 0,
  }));

  // Fallback: if count join doesn't work, get counts separately
  const memberCounts: Record<string, number> = {};
  if (groupList.some(g => g.member_count === 0 && g.id)) {
    const { data: counts } = await admin
      .from('contact_group_members')
      .select('group_id')
      .eq('tenant_id', tenantId);
    for (const row of (counts ?? []) as { group_id: string }[]) {
      memberCounts[row.group_id] = (memberCounts[row.group_id] ?? 0) + 1;
    }
    groupList.forEach(g => { if (memberCounts[g.id]) g.member_count = memberCounts[g.id]; });
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Contact Groups</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Segment your contacts into groups for targeted campaigns, discounts, and bulk messaging.
            AI can suggest the right group for each contact based on their behaviour.
          </p>
        </div>
        <span className="text-xs font-semibold text-gray-500 bg-white border border-green-100 px-3 py-1.5 rounded-full shadow-sm shrink-0">
          {groupList.length} group{groupList.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Create group */}
      <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Tag size={15} className="text-emerald-600" />
          <h3 className="text-sm font-semibold text-gray-800">Create new group</h3>
        </div>
        <GroupCreateForm />
      </div>

      {/* Groups list */}
      {groupList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm flex flex-col items-center justify-center py-16 gap-3">
          <Users size={28} className="text-gray-200" />
          <p className="text-sm font-medium text-gray-400">No groups yet</p>
          <p className="text-xs text-gray-300 text-center max-w-xs">
            Create groups like &ldquo;VIP Customers&rdquo;, &ldquo;Hot Leads&rdquo;, or &ldquo;Price Sensitive&rdquo; to segment your contacts.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {groupList.map(g => (
            <Link
              key={g.id}
              href={`/groups/${g.id}`}
              className="bg-white rounded-2xl border border-green-100 shadow-sm p-5 hover:shadow-md hover:border-emerald-200 transition-all group"
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 shadow-sm"
                  style={{ backgroundColor: g.color + '20', border: `1px solid ${g.color}40` }}
                >
                  {g.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-800 truncate">{g.name}</p>
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-emerald-500 transition-colors shrink-0" />
                  </div>
                  {g.description && (
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{g.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                      style={{ backgroundColor: g.color + '15', color: g.color }}
                    >
                      {g.member_count} contact{g.member_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
