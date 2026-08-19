'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { LeadNote } from '@alphabot/shared';

export async function getLeadNotesAction(
  conversationId: string,
): Promise<{ notes: LeadNote[]; error?: string }> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { notes: [], error: 'Not authenticated' };

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

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();

  const { data: tu } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();
  if (!tu) return { error: 'Tenant not found' };

  // Verify the conversation belongs to this tenant
  const { data: conv } = await admin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('tenant_id', tu.tenant_id)
    .single();
  if (!conv) return { error: 'Conversation not found' };

  const { error } = await admin.from('lead_notes').insert({
    conversation_id: conversationId,
    tenant_id:       tu.tenant_id,
    author_name:     user.email ?? 'Agent',
    note:            note.trim(),
  });

  if (error) return { error: error.message };
  return {};
}
