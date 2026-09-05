'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { revalidatePath }         from 'next/cache';
import { getSession }             from '@/lib/session';

export type TriggerEvent = 'contact_created' | 'conversation_resolved' | 'lead_created' | 'order_delivered';

export type LifecycleSequence = {
  id:               string;
  tenant_id:        string;
  product_slug:     string;
  name:             string;
  trigger_event:    TriggerEvent;
  delay_days:       number;
  message_template: string;
  enabled:          boolean;
  created_at:       string;
};

export async function listLifecycleSequences(): Promise<{ sequences: LifecycleSequence[]; error?: string }> {
  const session = await getSession();
  if (!session) return { sequences: [], error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('lifecycle_sequences')
    .select('*')
    .eq('tenant_id', session.tenantId)
    .order('created_at', { ascending: true });

  if (error) return { sequences: [], error: error.message };
  return { sequences: (data ?? []) as LifecycleSequence[] };
}

export async function createLifecycleSequence(input: {
  product_slug:     string;
  name:             string;
  trigger_event:    TriggerEvent;
  delay_days:       number;
  message_template: string;
}): Promise<{ sequence?: LifecycleSequence; error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  if (!input.name.trim())             return { error: 'Name is required' };
  if (!input.message_template.trim()) return { error: 'Message template is required' };
  if (input.delay_days < 1)           return { error: 'Delay must be at least 1 day' };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('lifecycle_sequences')
    .insert({ tenant_id: session.tenantId, ...input, name: input.name.trim(), message_template: input.message_template.trim() })
    .select('*')
    .single();

  if (error) return { error: error.message };
  revalidatePath('/call-triggers');
  return { sequence: data as LifecycleSequence };
}

export async function updateLifecycleSequence(
  id: string,
  input: Partial<{
    name:             string;
    trigger_event:    TriggerEvent;
    delay_days:       number;
    message_template: string;
    product_slug:     string;
  }>,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('lifecycle_sequences')
    .update(input)
    .eq('id', id)
    .eq('tenant_id', session.tenantId);

  if (error) return { error: error.message };
  revalidatePath('/call-triggers');
  return {};
}

export async function toggleLifecycleSequence(id: string, enabled: boolean): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('lifecycle_sequences')
    .update({ enabled })
    .eq('id', id)
    .eq('tenant_id', session.tenantId);

  if (error) return { error: error.message };
  revalidatePath('/call-triggers');
  return {};
}

export async function deleteLifecycleSequence(id: string): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('lifecycle_sequences')
    .delete()
    .eq('id', id)
    .eq('tenant_id', session.tenantId);

  if (error) return { error: error.message };
  revalidatePath('/call-triggers');
  return {};
}
