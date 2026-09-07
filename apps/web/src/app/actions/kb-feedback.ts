'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';

export async function flagMessageAction(
  messageId: string,
  conversationId: string,
  messageContent: string,
): Promise<{ success?: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();

  // Verify the conversation belongs to this tenant
  const { data: conv } = await admin
    .from('conversations')
    .select('tenant_id')
    .eq('id', conversationId)
    .single();

  if (!conv || conv.tenant_id !== session.tenantId) {
    return { error: 'Not authorised' };
  }

  // Prevent duplicate flags for the same message
  const { count } = await admin
    .from('kb_feedback')
    .select('*', { count: 'exact', head: true })
    .eq('message_id', messageId);

  if ((count ?? 0) > 0) return { success: true }; // already flagged — silently OK

  await admin.from('kb_feedback').insert({
    tenant_id:       session.tenantId,
    conversation_id: conversationId,
    message_id:      messageId,
    message_content: messageContent,
    flagged_by:      session.userId ?? null,
  });

  return { success: true };
}
