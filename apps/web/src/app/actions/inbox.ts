'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';

export type InboxConversation = {
  id:                  string;
  status:              string;
  product_type:        string;
  updated_at:          string;
  contact_name:        string | null;
  contact_phone:       string | null;
  assigned_agent_id:   string | null;
  whatsapp_number_id:  string | null;
};

export type InboxWhatsAppNumber = {
  id:           string;
  phone_number: string;
  label:        string | null;
};

export type InboxMessage = {
  id:               string;
  role:             'user' | 'assistant' | 'system';
  content:          string;
  timestamp:        string;
  confidence_score: number | null;
};

export async function getWhatsAppNumbersForInboxAction(): Promise<InboxWhatsAppNumber[]> {
  const session = await getSession();
  if (!session) return [];

  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('whatsapp_numbers')
    .select('id, phone_number, label')
    .eq('tenant_id', session.tenantId)
    .eq('active', true)
    .order('created_at', { ascending: true });

  return (data ?? []) as InboxWhatsAppNumber[];
}

export async function getInboxConversationsAction(
  whatsappNumberId?: string,
): Promise<{ conversations: InboxConversation[]; tenantId: string } | null> {
  const session = await getSession();
  if (!session) return null;

  const admin = getSupabaseAdminClient();

  let query = admin
    .from('conversations')
    .select('id, status, product_type, updated_at, assigned_agent_id, whatsapp_number_id, contacts(phone, name)')
    .eq('tenant_id', session.tenantId)
    .in('status', ['escalated', 'bot_paused'])
    .order('updated_at', { ascending: false })
    .limit(100);

  if (whatsappNumberId) {
    query = query.eq('whatsapp_number_id', whatsappNumberId);
  }

  const { data } = await query;

  type ContactShape = { phone: string | null; name: string | null };
  const conversations: InboxConversation[] = (data as unknown as Record<string, unknown>[]).map((row) => {
    const raw = row['contacts'];
    const c: ContactShape | null = Array.isArray(raw)
      ? ((raw as ContactShape[])[0] ?? null)
      : ((raw as ContactShape | null) ?? null);
    return {
      id:                 row['id'] as string,
      status:             row['status'] as string,
      product_type:       row['product_type'] as string,
      updated_at:         row['updated_at'] as string,
      assigned_agent_id:  (row['assigned_agent_id'] as string | null) ?? null,
      whatsapp_number_id: (row['whatsapp_number_id'] as string | null) ?? null,
      contact_name:       c?.name ?? null,
      contact_phone:      c?.phone ?? null,
    };
  });

  return { conversations, tenantId: session.tenantId };
}

export async function getInboxMessagesAction(conversationId: string): Promise<InboxMessage[]> {
  const session = await getSession();
  if (!session) return [];

  const admin = getSupabaseAdminClient();

  // Verify ownership
  const { data: conv } = await admin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('tenant_id', session.tenantId)
    .single();

  if (!conv) return [];

  const { data } = await admin
    .from('messages')
    .select('id, role, content, timestamp, confidence_score')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: false })
    .limit(60);

  return ((data ?? []) as InboxMessage[]).reverse();
}
