'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { unstable_noStore as noStore } from 'next/cache';

export interface ScheduledMessageRow {
  id: string;
  name: string;
  message_body: string | null;
  template_name: string | null;
  template_language: string;
  template_components: unknown[];
  scheduled_at: string;
  recurrence: { type: string; days_of_week?: number[]; day_of_month?: number };
  bot_handles_replies: boolean;
  status: 'draft' | 'scheduled' | 'running' | 'completed' | 'cancelled' | 'failed';
  failure_reason: string | null;
  created_at: string;
}

export interface RecipientRow {
  id: string;
  phone: string;
  contact_name: string | null;
  session_status: 'active' | 'expired' | 'unknown' | null;
  message_type: 'freeform' | 'template' | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped';
  whatsapp_message_id: string | null;
  conversation_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
}

export interface CreateScheduledMessageInput {
  tenantId: string;
  name: string;
  message_body?: string;
  template_name?: string;
  template_language?: string;
  template_components?: unknown[];
  scheduled_at: string;
  recurrence?: { type: string; days_of_week?: number[]; day_of_month?: number };
  bot_handles_replies?: boolean;
  recipients: { phone: string; contact_name?: string; contact_id?: string }[];
}

async function getAuthTenantId(): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();
  return data?.tenant_id ?? null;
}

export async function listScheduledMessagesAction(page = 1, status?: string): Promise<{
  messages: (ScheduledMessageRow & { recipients: { total: number; sent: number; failed: number } })[];
  total: number;
}> {
  noStore();
  const tenantId = await getAuthTenantId();
  if (!tenantId) return { messages: [], total: 0 };

  const admin    = getSupabaseAdminClient();
  const pageSize = 20;
  const offset   = (page - 1) * pageSize;

  let query = admin
    .from('scheduled_messages')
    .select('id, name, message_body, template_name, scheduled_at, recurrence, bot_handles_replies, status, failure_reason, created_at', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (status) query = (query as typeof query).eq('status', status);

  const { data, count } = await query;
  const msgs = (data ?? []) as ScheduledMessageRow[];

  const ids = msgs.map(m => m.id);
  const { data: recs } = ids.length > 0
    ? await admin
        .from('scheduled_message_recipients')
        .select('scheduled_message_id, status')
        .in('scheduled_message_id', ids)
    : { data: [] };

  const countMap: Record<string, { total: number; sent: number; failed: number }> = {};
  for (const r of recs ?? []) {
    const mid = r.scheduled_message_id as string;
    if (!countMap[mid]) countMap[mid] = { total: 0, sent: 0, failed: 0 };
    countMap[mid]!.total++;
    if (['sent', 'delivered', 'read'].includes(r.status as string)) countMap[mid]!.sent++;
    if (['failed', 'skipped'].includes(r.status as string)) countMap[mid]!.failed++;
  }

  return {
    messages: msgs.map(m => ({ ...m, recipients: countMap[m.id] ?? { total: 0, sent: 0, failed: 0 } })),
    total: count ?? 0,
  };
}

export async function getScheduledMessageAction(id: string): Promise<ScheduledMessageRow | null> {
  noStore();
  const tenantId = await getAuthTenantId();
  if (!tenantId) return null;
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('scheduled_messages')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
  return data as ScheduledMessageRow | null;
}

export async function getRecipientLogAction(id: string, page = 1): Promise<{ recipients: RecipientRow[]; total: number }> {
  noStore();
  const tenantId = await getAuthTenantId();
  if (!tenantId) return { recipients: [], total: 0 };
  const admin    = getSupabaseAdminClient();
  const pageSize = 50;
  const offset   = (page - 1) * pageSize;
  const { data, count } = await admin
    .from('scheduled_message_recipients')
    .select('id, phone, contact_name, session_status, message_type, status, whatsapp_message_id, conversation_id, error_message, sent_at, delivered_at, read_at', { count: 'exact' })
    .eq('scheduled_message_id', id)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  return { recipients: (data ?? []) as RecipientRow[], total: count ?? 0 };
}

export async function createScheduledMessageAction(input: CreateScheduledMessageInput): Promise<{ id?: string; error?: string }> {
  const tenantId = await getAuthTenantId();
  if (!tenantId) return { error: 'Not authenticated' };

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = getSupabaseAdminClient();
  const { data: msg, error: msgErr } = await admin
    .from('scheduled_messages')
    .insert({
      tenant_id:           tenantId,
      name:                input.name,
      message_body:        input.message_body ?? null,
      template_name:       input.template_name ?? null,
      template_language:   input.template_language ?? 'en',
      template_components: input.template_components ?? [],
      scheduled_at:        input.scheduled_at,
      recurrence:          input.recurrence ?? { type: 'once' },
      bot_handles_replies: input.bot_handles_replies ?? false,
      status:              'scheduled',
      created_by:          user?.id ?? null,
    })
    .select('id')
    .single();

  if (msgErr || !msg) return { error: msgErr?.message ?? 'Failed to create' };

  const rows = input.recipients.map(r => ({
    scheduled_message_id: msg.id,
    tenant_id:            tenantId,
    phone:                r.phone,
    contact_name:         r.contact_name ?? null,
    contact_id:           r.contact_id ?? null,
    status:               'pending',
  }));
  const { error: recErr } = await admin.from('scheduled_message_recipients').insert(rows);
  if (recErr) {
    await admin.from('scheduled_messages').delete().eq('id', msg.id);
    return { error: recErr.message };
  }

  revalidatePath('/scheduled-messages');
  return { id: msg.id };
}

export async function cancelScheduledMessageAction(id: string): Promise<{ error?: string }> {
  const tenantId = await getAuthTenantId();
  if (!tenantId) return { error: 'Not authenticated' };
  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('scheduled_messages')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('tenant_id', tenantId);
  revalidatePath('/scheduled-messages');
  return error ? { error: error.message } : {};
}

export async function getContactsAction(): Promise<{ id: string; phone: string; name: string | null }[]> {
  noStore();
  const tenantId = await getAuthTenantId();
  if (!tenantId) return [];
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('contacts')
    .select('id, phone, name')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })
    .limit(500);
  return (data ?? []) as { id: string; phone: string; name: string | null }[];
}

export async function getMetaTemplatesAction(): Promise<{ name: string; language: string; category: string; components: unknown[] }[]> {
  noStore();
  const tenantId = await getAuthTenantId();
  if (!tenantId) return [];

  const admin = getSupabaseAdminClient();
  const { data: wn } = await admin
    .from('whatsapp_numbers')
    .select('provider, config_json')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .limit(1)
    .single();

  if (!wn || wn.provider !== 'meta_cloud') return [];

  const cfg = wn.config_json as { phone_number_id: string; access_token: string; waba_id?: string };
  let wabaId = cfg.waba_id;

  if (!wabaId) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${cfg.phone_number_id}?fields=account_id&access_token=${cfg.access_token}`
      );
      const d = await res.json() as { account_id?: string };
      wabaId = d.account_id;
    } catch { return []; }
  }

  if (!wabaId) return [];

  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${wabaId}/message_templates?fields=name,status,language,category,components&limit=100&access_token=${cfg.access_token}`
    );
    const d = await res.json() as { data?: { status?: string; name: string; language: string; category: string; components: unknown[] }[] };
    return (d.data ?? []).filter(t => t.status === 'APPROVED');
  } catch { return []; }
}
