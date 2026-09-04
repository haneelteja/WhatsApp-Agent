'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { writeAuditLog } from '@/lib/audit';

export interface BotPersona {
  product_slug:         string;
  persona_name:         string | null;
  persona_role:         string | null;
  company_description:  string | null;
  company_values:       string | null;
  conversation_purpose: string | null;
}

export async function getBotPersonasAction(): Promise<BotPersona[]> {
  const session = await getSession();
  if (!session) return [];
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('bot_configs')
    .select('product_slug, persona_name, persona_role, company_description, company_values, conversation_purpose')
    .eq('tenant_id', session.tenantId);
  return (data ?? []) as BotPersona[];
}

export async function saveBotPersonaAction(
  productSlug: string,
  persona: Omit<BotPersona, 'product_slug'>,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();
  const update = {
    persona_name:         persona.persona_name         || null,
    persona_role:         persona.persona_role         || null,
    company_description:  persona.company_description  || null,
    company_values:       persona.company_values       || null,
    conversation_purpose: persona.conversation_purpose || null,
    updated_at:           new Date().toISOString(),
  };

  // Upsert — bot_config may not yet have a row for this slug
  const { error } = await admin
    .from('bot_configs')
    .upsert(
      { tenant_id: session.tenantId, product_slug: productSlug, ...update },
      { onConflict: 'tenant_id,product_slug', ignoreDuplicates: false },
    );

  if (error) return { error: error.message };

  void writeAuditLog({
    tenantId:    session.tenantId,
    actorId:     session.userId,
    actorEmail:  session.userEmail,
    action:      'bot.persona.updated',
    entityType:  'bot_config',
    entityId:    productSlug,
    description: `Updated bot persona for ${productSlug.replace(/_/g, ' ')} (name: "${persona.persona_name ?? 'unset'}")`,
    metadata: { productSlug, personaName: persona.persona_name },
  });

  revalidatePath('/settings');
  return {};
}
