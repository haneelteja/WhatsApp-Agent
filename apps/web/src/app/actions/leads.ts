'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const VALID_STAGES = ['greeting', 'qualifying', 'resolving', 'following_up', 'closing'] as const;
type LeadStage = typeof VALID_STAGES[number];

export async function updateLeadStageAction(
  conversationId: string,
  stage: LeadStage,
  markConverted = false,
): Promise<{ error?: string }> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();

  // Verify conversation belongs to this user's tenant
  const { data: tu } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!tu?.tenant_id) return { error: 'Unauthorized' };

  const updates: Record<string, unknown> = { stage };
  if (markConverted) {
    updates['status'] = 'resolved';
  }

  const { error } = await admin
    .from('conversations')
    .update(updates)
    .eq('id', conversationId)
    .eq('tenant_id', tu.tenant_id);

  if (error) return { error: error.message };
  return {};
}
