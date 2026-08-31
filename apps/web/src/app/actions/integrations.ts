'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient }  from '@/lib/supabase/admin';
import { revalidatePath }          from 'next/cache';
import { getSession }              from '@/lib/session';

// ─── Types ────────────────────────────────────────────────────────────────────

export type IntegrationSettings = {
  id:                      string;
  tenant_id:               string;
  webhook_api_key:         string;
  welcome_template:        string;
  enabled:                 boolean;
  outbound_webhook_url:    string | null;
  outbound_signing_secret: string;
  outbound_events:         string[];
};

export type WebhookLog = {
  id:            string;
  contact_phone: string;
  contact_name:  string | null;
  status:        'sent' | 'failed' | 'duplicate' | 'skipped';
  error_message: string | null;
  source:        string | null;
  triggered_at:  string;
};

export type OutboundLog = {
  id:            string;
  event_type:    string;
  status:        'delivered' | 'failed' | 'skipped';
  http_status:   number | null;
  error_message: string | null;
  triggered_at:  string;
};

// ─── Get or create integration settings ──────────────────────────────────────

export async function getOrCreateIntegration(): Promise<{ settings?: IntegrationSettings; error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();

  const { data: existing } = await admin
    .from('tenant_integrations')
    .select('id, tenant_id, webhook_api_key, welcome_template, enabled, outbound_webhook_url, outbound_signing_secret, outbound_events')
    .eq('tenant_id', session.tenantId)
    .single();

  if (existing) return { settings: existing as IntegrationSettings };

  const { data: created, error } = await admin
    .from('tenant_integrations')
    .insert({ tenant_id: session.tenantId })
    .select('id, tenant_id, webhook_api_key, welcome_template, enabled, outbound_webhook_url, outbound_signing_secret, outbound_events')
    .single();

  if (error) return { error: error.message };
  return { settings: created as IntegrationSettings };
}

// ─── Inbound actions ──────────────────────────────────────────────────────────

export async function saveWelcomeTemplate(template: string): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };
  if (!template.trim()) return { error: 'Template cannot be empty' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('tenant_integrations')
    .update({ welcome_template: template.trim() })
    .eq('tenant_id', session.tenantId);

  if (error) return { error: error.message };
  revalidatePath('/integrations');
  return {};
}

export async function toggleIntegration(enabled: boolean): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('tenant_integrations')
    .update({ enabled })
    .eq('tenant_id', session.tenantId);

  if (error) return { error: error.message };
  revalidatePath('/integrations');
  return {};
}

export async function regenerateApiKey(): Promise<{ key?: string; error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const newKey = 'wh_' + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('tenant_integrations')
    .update({ webhook_api_key: newKey })
    .eq('tenant_id', session.tenantId);

  if (error) return { error: error.message };
  revalidatePath('/integrations');
  return { key: newKey };
}

export async function sendTestMessage(phone: string, name: string): Promise<{ sent?: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };
  if (!phone.trim()) return { error: 'Phone number is required' };

  const admin   = getSupabaseAdminClient();
  const apiBase = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://whatsapp-agent-fmtg.onrender.com';

  const { data: integration } = await admin
    .from('tenant_integrations')
    .select('webhook_api_key')
    .eq('tenant_id', session.tenantId)
    .single();

  if (!integration) return { error: 'Integration not configured' };

  const res = await fetch(`${apiBase}/api/integrations/webhook/contact`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key':    integration.webhook_api_key as string,
    },
    body: JSON.stringify({ phone: phone.trim(), name: name.trim() || undefined, source: 'test' }),
  });

  const json = await res.json() as { sent?: boolean; error?: string };
  if (!res.ok) return { error: json.error ?? 'Failed to send test message' };
  return { sent: json.sent ?? true };
}

export async function getWebhookLogs(): Promise<{ logs: WebhookLog[]; error?: string }> {
  const session = await getSession();
  if (!session) return { logs: [], error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('webhook_logs')
    .select('id, contact_phone, contact_name, status, error_message, source, triggered_at')
    .eq('tenant_id', session.tenantId)
    .order('triggered_at', { ascending: false })
    .limit(100);

  if (error) return { logs: [], error: error.message };
  return { logs: (data ?? []) as WebhookLog[] };
}

// ─── Outbound actions ─────────────────────────────────────────────────────────

export async function saveOutboundSettings(
  url:    string | null,
  events: string[],
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  if (url && url.trim()) {
    try { new URL(url.trim()); } catch { return { error: 'Invalid URL format' }; }
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('tenant_integrations')
    .update({
      outbound_webhook_url: url?.trim() || null,
      outbound_events:      events,
    })
    .eq('tenant_id', session.tenantId);

  if (error) return { error: error.message };
  revalidatePath('/integrations');
  return {};
}

export async function regenerateSigningSecret(): Promise<{ secret?: string; error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const randomBytes = new Uint8Array(20);
  crypto.getRandomValues(randomBytes);
  const newSecret = 'sig_' + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('tenant_integrations')
    .update({ outbound_signing_secret: newSecret })
    .eq('tenant_id', session.tenantId);

  if (error) return { error: error.message };
  revalidatePath('/integrations');
  return { secret: newSecret };
}

export async function triggerManualPush(
  type: 'contacts' | 'conversations' | 'leads',
): Promise<{ count?: number; error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  // Need the live access token for the downstream API call
  const supabase = await getSupabaseServerClient();
  const { data: { session: s } } = await supabase.auth.getSession();
  if (!s) return { error: 'Unauthorized' };

  const apiBase = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://whatsapp-agent-fmtg.onrender.com';
  const res = await fetch(`${apiBase}/api/integrations/outbound/push`, {
    method:  'POST',
    headers: {
      'content-type':  'application/json',
      'Authorization': `Bearer ${s.access_token}`,
    },
    body: JSON.stringify({ type }),
  });

  const json = await res.json() as { count?: number; error?: string };
  if (!res.ok) return { error: json.error ?? 'Push failed' };
  return { count: json.count };
}

export async function getOutboundLogs(): Promise<{ logs: OutboundLog[]; error?: string }> {
  const session = await getSession();
  if (!session) return { logs: [], error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('outbound_logs')
    .select('id, event_type, status, http_status, error_message, triggered_at')
    .eq('tenant_id', session.tenantId)
    .order('triggered_at', { ascending: false })
    .limit(100);

  if (error) return { logs: [], error: error.message };
  return { logs: (data ?? []) as OutboundLog[] };
}
