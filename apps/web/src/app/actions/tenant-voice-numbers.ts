'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface VoiceNumberRow {
  id:         string;
  number:     string;
  label:      string;
  provider:   string;
  is_default: boolean;
  active:     boolean;
  created_at: string;
}

async function getCallerTenantId(): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();
  return data?.tenant_id ?? null;
}

export async function listVoiceNumbersAction(): Promise<{ numbers: VoiceNumberRow[]; error?: string }> {
  const tenantId = await getCallerTenantId();
  if (!tenantId) return { numbers: [], error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('tenant_voice_numbers')
    .select('id, number, label, provider, is_default, active, created_at')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) return { numbers: [], error: error.message };
  return { numbers: (data ?? []) as VoiceNumberRow[] };
}

export async function addVoiceNumberAction(
  number: string,
  label: string,
  provider: string,
  makeDefault: boolean,
): Promise<{ error?: string }> {
  const tenantId = await getCallerTenantId();
  if (!tenantId) return { error: 'Not authenticated' };

  const normalized = number.trim().startsWith('+') ? number.trim() : `+${number.trim()}`;
  const admin = getSupabaseAdminClient();

  if (makeDefault) {
    await admin.from('tenant_voice_numbers').update({ is_default: false }).eq('tenant_id', tenantId);
  }

  const { error } = await admin
    .from('tenant_voice_numbers')
    .upsert(
      { tenant_id: tenantId, number: normalized, label: label.trim(), provider, is_default: makeDefault, active: true },
      { onConflict: 'tenant_id,number' },
    );

  if (error) return { error: error.message };
  revalidatePath('/settings');
  return {};
}

export async function setDefaultVoiceNumberAction(id: string): Promise<{ error?: string }> {
  const tenantId = await getCallerTenantId();
  if (!tenantId) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();
  await admin.from('tenant_voice_numbers').update({ is_default: false }).eq('tenant_id', tenantId);
  const { error } = await admin.from('tenant_voice_numbers').update({ is_default: true }).eq('id', id).eq('tenant_id', tenantId);

  if (error) return { error: error.message };
  revalidatePath('/settings');
  return {};
}

export async function removeVoiceNumberAction(id: string): Promise<{ error?: string }> {
  const tenantId = await getCallerTenantId();
  if (!tenantId) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('tenant_voice_numbers')
    .update({ active: false })
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) return { error: error.message };
  revalidatePath('/settings');
  return {};
}
