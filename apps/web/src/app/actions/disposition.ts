'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { revalidatePath } from 'next/cache';

export interface DispositionCategory {
  id:          string;
  name:        string;
  color:       string;
  description: string | null;
  sort_order:  number;
}

export interface UnresponsiveLead {
  id:             string;
  product_type:   string;
  updated_at:     string;
  outcome_set_at: string | null;
  lead_follow_up_count: number | null;
  disposition_category_id: string | null;
  disposition_notes:       string | null;
  contact_name:  string | null;
  contact_phone: string | null;
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function getDispositionCategoriesAction(): Promise<DispositionCategory[]> {
  const session = await getSession();
  if (!session) return [];
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('disposition_categories')
    .select('id, name, color, description, sort_order')
    .eq('tenant_id', session.tenantId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  return (data ?? []) as DispositionCategory[];
}

export async function createDispositionCategoryAction(
  name: string,
  color: string,
  description: string,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };
  const admin = getSupabaseAdminClient();
  const { error } = await admin.from('disposition_categories').insert({
    tenant_id:   session.tenantId,
    name:        name.trim(),
    color,
    description: description.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath('/conversations');
  revalidatePath('/settings');
  return {};
}

export async function updateDispositionCategoryAction(
  id: string,
  updates: Partial<Pick<DispositionCategory, 'name' | 'color' | 'description'>>,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };
  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('disposition_categories')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', session.tenantId);
  if (error) return { error: error.message };
  revalidatePath('/conversations');
  revalidatePath('/settings');
  return {};
}

export async function deleteDispositionCategoryAction(id: string): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };
  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('disposition_categories')
    .delete()
    .eq('id', id)
    .eq('tenant_id', session.tenantId);
  if (error) return { error: error.message };
  revalidatePath('/conversations');
  revalidatePath('/settings');
  return {};
}

// ─── Unresponsive leads ───────────────────────────────────────────────────────

export async function getUnresponsiveLeadsAction(): Promise<UnresponsiveLead[]> {
  const session = await getSession();
  if (!session) return [];
  const admin = getSupabaseAdminClient();

  const { data } = await admin
    .from('conversations')
    .select('id, product_type, updated_at, outcome_set_at, lead_follow_up_count, disposition_category_id, disposition_notes, contacts(name, phone)')
    .eq('tenant_id', session.tenantId)
    .eq('terminal_outcome', 'unresponsive')
    .order('outcome_set_at', { ascending: false })
    .limit(200);

  return ((data ?? []) as unknown as Array<{
    id: string; product_type: string; updated_at: string; outcome_set_at: string | null;
    lead_follow_up_count: number | null; disposition_category_id: string | null; disposition_notes: string | null;
    contacts: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null;
  }>).map(row => {
    const contactsRaw = row.contacts;
    const contacts = Array.isArray(contactsRaw) ? (contactsRaw[0] ?? null) : contactsRaw;
    return ({
      id:                      row.id,
      product_type:            row.product_type,
      updated_at:              row.updated_at,
      outcome_set_at:          row.outcome_set_at,
      lead_follow_up_count:    row.lead_follow_up_count,
      disposition_category_id: row.disposition_category_id,
      disposition_notes:       row.disposition_notes,
      contact_name:            contacts?.name ?? null,
      contact_phone:           contacts?.phone ?? null,
    });
  });
}

export async function setDispositionAction(
  conversationId: string,
  categoryId: string | null,
  notes: string | null,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };
  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('conversations')
    .update({
      disposition_category_id: categoryId,
      disposition_notes:       notes,
      disposition_set_by:      session.userId,
      disposition_set_at:      new Date().toISOString(),
    })
    .eq('id', conversationId)
    .eq('tenant_id', session.tenantId);
  if (error) return { error: error.message };
  revalidatePath('/conversations');
  return {};
}

export async function reEngageLeadAction(conversationId: string): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };
  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('conversations')
    .update({
      status:               'open',
      terminal_outcome:     null,
      outcome_set_by:       null,
      outcome_set_at:       null,
      lead_follow_up_count: 0,
      updated_at:           new Date().toISOString(),
    })
    .eq('id', conversationId)
    .eq('tenant_id', session.tenantId);
  if (error) return { error: error.message };
  revalidatePath('/conversations');
  return {};
}
