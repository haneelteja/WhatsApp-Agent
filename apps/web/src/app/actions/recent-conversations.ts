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
  contactId:   string;
  displayName: string;
  id:          string;   // most-recent conversation id (for link + messages)
  status:      string;
  updated_at:  string;
  bots:        Array<{ product_type: string; id: string; status: string }>;
  messages:    RecentMessage[];
};

type RawConv = {
  id:           string;
  status:       string;
  product_type: string;
  updated_at:   string;
  contacts:     unknown;
};

type ContactRow = { id: string; name: string | null; phone: string };

function groupByContact(convs: RawConv[], excludeIds: Set<string>): Array<{
  contact: ContactRow;
  convs:   RawConv[];
}> {
  const map = new Map<string, { contact: ContactRow; convs: RawConv[] }>();
  for (const conv of convs) {
    const contact = conv.contacts as ContactRow | null;
    if (!contact?.id) continue;
    const existing = map.get(contact.id);
    if (existing) {
      existing.convs.push(conv);
    } else {
      map.set(contact.id, { contact, convs: [conv] });
    }
  }
  return [...map.values()].filter(e => !excludeIds.has(e.contact.id));
}

export async function getRecentConversationsAction(excludeContactIds: string[]): Promise<RecentConv[]> {
  const session = await getSession();
  if (!session) return [];

  const admin = getSupabaseAdminClient();

  // Fetch enough conversations to produce 5 unique contacts after dedup
  const { data: convs } = await admin
    .from('conversations')
    .select('id, status, product_type, updated_at, contacts(id, name, phone)')
    .eq('tenant_id', session.tenantId)
    .order('updated_at', { ascending: false })
    .limit(60);

  const excludeSet = new Set(excludeContactIds);
  const groups = groupByContact((convs ?? []) as RawConv[], excludeSet).slice(0, 5);

  if (!groups.length) return [];

  // Fetch messages only for the most-recent conversation of each unique contact
  const primaryIds = groups.map(g => g.convs[0].id);
  const { data: msgs } = await admin
    .from('messages')
    .select('id, conversation_id, role, content, timestamp')
    .in('conversation_id', primaryIds)
    .order('timestamp', { ascending: false });

  const msgMap = new Map<string, RecentMessage[]>();
  for (const m of (msgs ?? [])) {
    const list = msgMap.get(m.conversation_id) ?? [];
    if (list.length < 5) list.push({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content, timestamp: m.timestamp });
    msgMap.set(m.conversation_id, list);
  }

  return groups.map(({ contact, convs: cList }) => {
    const primary = cList[0];
    const bots = cList.map(c => ({ product_type: c.product_type, id: c.id, status: c.status }));
    const messages = (msgMap.get(primary.id) ?? []).slice().reverse();
    return {
      contactId:   contact.id,
      displayName: contact.name ?? contact.phone ?? 'Unknown',
      id:          primary.id,
      status:      primary.status,
      updated_at:  primary.updated_at,
      bots,
      messages,
    };
  });
}
