'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export interface CopilotConfig {
  enabled: boolean;
  instructions: string;
  allowed_actions: string[];
}

const ALL_ACTIONS = ['add_kb_article', 'update_escalation_triggers', 'toggle_button_template', 'update_system_prompt'];

function defaultCopilotConfig(): CopilotConfig {
  return { enabled: true, instructions: '', allowed_actions: ALL_ACTIONS };
}

export async function getCopilotConfigAction(tenantId: string): Promise<CopilotConfig> {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('tenants').select('copilot_config').eq('id', tenantId).single();
  const raw = (data as { copilot_config?: unknown } | null)?.copilot_config;
  if (!raw || typeof raw !== 'object') return defaultCopilotConfig();
  const cfg = raw as Record<string, unknown>;
  return {
    enabled: typeof cfg['enabled'] === 'boolean' ? cfg['enabled'] : true,
    instructions: typeof cfg['instructions'] === 'string' ? cfg['instructions'] : '',
    allowed_actions: Array.isArray(cfg['allowed_actions']) ? cfg['allowed_actions'] as string[] : ALL_ACTIONS,
  };
}

export async function saveCopilotConfigAction(tenantId: string, config: CopilotConfig): Promise<void> {
  const admin = getSupabaseAdminClient();
  await admin.from('tenants').update({ copilot_config: config }).eq('id', tenantId);
  revalidatePath(`/platform/clients/${tenantId}`);
}
