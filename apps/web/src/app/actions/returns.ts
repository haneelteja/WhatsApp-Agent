'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export interface ReturnRequest {
  id: string;
  type: 'return' | 'replacement';
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  staff_notes: string | null;
  created_at: string;
  contact: { name: string | null; phone: string } | null;
  order: { id: string; total_amount: number | null } | null;
}

export async function listReturnRequestsAction(): Promise<ReturnRequest[]> {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!tenantUser) throw new Error('No tenant found');

  const { data, error } = await admin
    .from('return_requests')
    .select(`
      id, type, reason, status, staff_notes, created_at,
      contact:contacts(name, phone),
      order:orders(id, total_amount)
    `)
    .eq('tenant_id', tenantUser.tenant_id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  return (data ?? []) as unknown as ReturnRequest[];
}

export async function updateReturnStatusAction(
  returnRequestId: string,
  status: 'approved' | 'rejected' | 'completed',
  staffNotes?: string,
): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!tenantUser) throw new Error('No tenant found');

  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (staffNotes !== undefined) update['staff_notes'] = staffNotes;

  const { error } = await admin
    .from('return_requests')
    .update(update)
    .eq('id', returnRequestId)
    .eq('tenant_id', tenantUser.tenant_id);

  if (error) throw new Error(error.message);

  revalidatePath('/returns');
}
