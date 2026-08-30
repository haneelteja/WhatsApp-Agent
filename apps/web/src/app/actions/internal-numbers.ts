'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient }  from '@/lib/supabase/admin';
import { revalidatePath }          from 'next/cache';

export type InternalNumber = {
  id:         string;
  phone:      string;
  label:      string | null;
  created_at: string;
};

async function getTenantId(): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: tu } = await admin.from('tenant_users').select('tenant_id').eq('user_id', user.id).single();
  return tu?.tenant_id ?? null;
}

export async function listInternalNumbers(): Promise<{ numbers: InternalNumber[]; error?: string }> {
  const tenantId = await getTenantId();
  if (!tenantId) return { numbers: [], error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('tenant_internal_numbers')
    .select('id, phone, label, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) return { numbers: [], error: error.message };
  return { numbers: (data ?? []) as InternalNumber[] };
}

export async function addInternalNumber(
  phone: string,
  label: string,
): Promise<{ number?: InternalNumber; error?: string }> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: 'Unauthorized' };

  const cleaned = phone.trim().replace(/\s+/g, '');
  if (!cleaned) return { error: 'Phone number is required' };
  if (!/^\+?\d{7,15}$/.test(cleaned)) return { error: 'Enter a valid phone number (digits only, optionally starting with +)' };

  const normalized = cleaned.startsWith('+') ? cleaned : `+${cleaned}`;

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('tenant_internal_numbers')
    .insert({ tenant_id: tenantId, phone: normalized, label: label.trim() || null })
    .select('id, phone, label, created_at')
    .single();

  if (error) {
    if (error.code === '23505') return { error: 'This number is already in the list' };
    return { error: error.message };
  }

  revalidatePath('/settings');
  return { number: data as InternalNumber };
}

export async function removeInternalNumber(id: string): Promise<{ error?: string }> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('tenant_internal_numbers')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) return { error: error.message };
  revalidatePath('/settings');
  return {};
}
