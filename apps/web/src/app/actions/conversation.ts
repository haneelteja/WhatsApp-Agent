'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';
import { revalidatePath }         from 'next/cache';

// DEV-ONLY — remove before production (see production checklist §5)
export async function clearConversationAction(conversationId: string): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();

  // Verify conversation belongs to the caller's tenant
  const { data: conv } = await admin
    .from('conversations')
    .select('tenant_id')
    .eq('id', conversationId)
    .single();

  if (!conv || conv.tenant_id !== session.tenantId) {
    return { error: 'Not authorised' };
  }

  // Delete all messages first (no guaranteed cascade)
  const { error: msgErr } = await admin
    .from('messages')
    .delete()
    .eq('conversation_id', conversationId);
  if (msgErr) return { error: msgErr.message };

  // Reset conversation so the bot can start fresh
  const { error: convErr } = await admin
    .from('conversations')
    .update({ status: 'open', assigned_agent_id: null })
    .eq('id', conversationId);
  if (convErr) return { error: convErr.message };

  revalidatePath(`/conversations/${conversationId}`);
  return {};
}
