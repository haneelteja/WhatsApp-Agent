'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

async function getTenantId(): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = getSupabaseAdminClient();
  const { data: tu } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();
  return tu?.tenant_id ?? null;
}

export async function getInboundWebhookKeyAction(): Promise<{ key: string | null; error?: string }> {
  const tenantId = await getTenantId();
  if (!tenantId) return { key: null, error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('tenants')
    .select('inbound_webhook_key')
    .eq('id', tenantId)
    .single();

  if (error) return { key: null, error: error.message };
  return { key: (data as { inbound_webhook_key: string | null }).inbound_webhook_key };
}

export async function generateInboundWebhookKeyAction(): Promise<{ key: string | null; error?: string }> {
  const tenantId = await getTenantId();
  if (!tenantId) return { key: null, error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();

  // Generate a new UUID key via Postgres
  const { data, error } = await admin
    .from('tenants')
    .update({ inbound_webhook_key: crypto.randomUUID() })
    .eq('id', tenantId)
    .select('inbound_webhook_key')
    .single();

  if (error) return { key: null, error: error.message };
  return { key: (data as { inbound_webhook_key: string }).inbound_webhook_key };
}
