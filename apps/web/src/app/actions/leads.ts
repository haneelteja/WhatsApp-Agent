'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';

const VALID_STAGES = ['greeting', 'qualifying', 'resolving', 'following_up', 'closing'] as const;
type LeadStage = typeof VALID_STAGES[number];

export async function updateLeadStageAction(
  conversationId: string,
  stage: LeadStage,
  markConverted = false,
): Promise<{ error?: string }> {
  if (!VALID_STAGES.includes(stage as LeadStage)) return { error: 'Invalid stage' };

  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const updates: Record<string, unknown> = { stage };
  if (markConverted) {
    updates['status'] = 'resolved';
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('conversations')
    .update(updates)
    .eq('id', conversationId)
    .eq('tenant_id', session.tenantId);

  if (error) return { error: error.message };
  return {};
}
