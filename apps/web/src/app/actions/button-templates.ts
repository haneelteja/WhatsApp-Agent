'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const API_URL = process.env['API_BASE_URL'] ?? 'https://whatsapp-agent-fmtg.onrender.com';

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

export interface ButtonTemplateRow {
  id:               string;
  tenant_id:        string;
  product_slug:     string | null;
  name:             string;
  description:      string | null;
  type:             'quick_reply' | 'list' | 'cta_url';
  template_json:    Record<string, unknown>;
  trigger_keywords: string[];
  is_active:        boolean;
  created_at:       string;
  updated_at:       string;
}

export async function listButtonTemplatesAction(): Promise<{ templates: ButtonTemplateRow[]; error?: string }> {
  const tenantId = await getTenantId();
  if (!tenantId) return { templates: [], error: 'Unauthorized' };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('interactive_button_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) return { templates: [], error: error.message };
  return { templates: (data ?? []) as ButtonTemplateRow[] };
}

export async function createButtonTemplateAction(
  body: Omit<ButtonTemplateRow, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>,
): Promise<{ template?: ButtonTemplateRow; error?: string }> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: 'Unauthorized' };

  const res = await fetch(`${API_URL}/api/button-templates/${tenantId}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
    return { error: err.error ?? `HTTP ${res.status}` };
  }
  return { template: await res.json() as ButtonTemplateRow };
}

export async function updateButtonTemplateAction(
  id:   string,
  body: Partial<Omit<ButtonTemplateRow, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>>,
): Promise<{ template?: ButtonTemplateRow; error?: string }> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: 'Unauthorized' };

  const res = await fetch(`${API_URL}/api/button-templates/${tenantId}/${id}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
    return { error: err.error ?? `HTTP ${res.status}` };
  }
  return { template: await res.json() as ButtonTemplateRow };
}

export async function deleteButtonTemplateAction(id: string): Promise<{ error?: string }> {
  const tenantId = await getTenantId();
  if (!tenantId) return { error: 'Unauthorized' };

  const res = await fetch(`${API_URL}/api/button-templates/${tenantId}/${id}`, {
    method: 'DELETE',
  });

  if (!res.ok && res.status !== 204) {
    return { error: `HTTP ${res.status}` };
  }
  return {};
}
