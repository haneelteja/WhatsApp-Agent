'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';

export async function getInboundWebhookKeyAction(): Promise<{ key: string | null; error?: string }> {
  const session = await getSession();
  if (!session) return { key: null, error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('tenants')
    .select('inbound_webhook_key')
    .eq('id', session.tenantId)
    .single();

  if (error) return { key: null, error: error.message };
  return { key: (data as { inbound_webhook_key: string | null }).inbound_webhook_key };
}

export async function generateInboundWebhookKeyAction(): Promise<{ key: string | null; error?: string }> {
  const session = await getSession();
  if (!session) return { key: null, error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('tenants')
    .update({ inbound_webhook_key: crypto.randomUUID() })
    .eq('id', session.tenantId)
    .select('inbound_webhook_key')
    .single();

  if (error) return { key: null, error: error.message };
  return { key: (data as { inbound_webhook_key: string }).inbound_webhook_key };
}
