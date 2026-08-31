'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSession }              from '@/lib/session';
import type { LeadNote } from '@alphabot/shared';

export async function getLeadNotesAction(
  conversationId: string,
): Promise<{ notes: LeadNote[]; error?: string }> {
  const session = await getSession();
  if (!session) return { notes: [], error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('lead_notes')
    .select('id, conversation_id, tenant_id, author_name, note, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false });

  if (error) return { notes: [], error: error.message };
  return { notes: (data ?? []) as LeadNote[] };
}

export async function addLeadNoteAction(
  conversationId: string,
  note: string,
): Promise<{ error?: string }> {
  if (!note.trim()) return { error: 'Note cannot be empty' };

  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();

  // Verify the conversation belongs to this tenant
  const { data: conv } = await admin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('tenant_id', session.tenantId)
    .single();
  if (!conv) return { error: 'Conversation not found' };

  const { error } = await admin.from('lead_notes').insert({
    conversation_id: conversationId,
    tenant_id:       session.tenantId,
    author_name:     session.userEmail ?? 'Agent',
    note:            note.trim(),
  });

  if (error) return { error: error.message };
  return {};
}
