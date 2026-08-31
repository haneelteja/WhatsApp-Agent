'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';

export type RecentMessage = {
  id:        string;
  role:      'user' | 'assistant';
  content:   string;
  timestamp: string;
};

export type RecentConv = {
  id:           string;
  status:       string;
  product_type: string;
  updated_at:   string;
  displayName:  string;
  messages:     RecentMessage[];
};

export async function getRecentConversationsAction(offset: number): Promise<RecentConv[]> {
  const session = await getSession();
  if (!session) return [];

  const admin = getSupabaseAdminClient();

  const { data: convs } = await admin
    .from('conversations')
    .select('id, status, product_type, updated_at, contacts(name, phone)')
    .eq('tenant_id', session.tenantId)
    .order('updated_at', { ascending: false })
    .range(offset, offset + 4);

  if (!convs?.length) return [];

  const ids = convs.map(c => c.id);
  const { data: msgs } = await admin
    .from('messages')
    .select('id, conversation_id, role, content, timestamp')
    .in('conversation_id', ids)
    .order('timestamp', { ascending: false });

  const msgMap = new Map<string, RecentMessage[]>();
  for (const m of (msgs ?? [])) {
    const list = msgMap.get(m.conversation_id) ?? [];
    if (list.length < 5) list.push({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content, timestamp: m.timestamp });
    msgMap.set(m.conversation_id, list);
  }

  return convs.map(conv => {
    const contact     = (conv.contacts as unknown) as { name: string | null; phone: string } | null;
    const displayName = contact?.name ?? contact?.phone ?? 'Unknown';
    const messages    = (msgMap.get(conv.id) ?? []).slice().reverse();
    return { id: conv.id, status: conv.status, product_type: conv.product_type, updated_at: conv.updated_at, displayName, messages };
  });
}
