'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';

export interface AuditLogEntry {
  id:           string;
  tenant_id:    string | null;
  tenant_name:  string | null;
  actor_id:     string | null;
  actor_email:  string | null;
  action:       string;
  entity_type:  string | null;
  entity_id:    string | null;
  description:  string;
  metadata:     Record<string, unknown> | null;
  created_at:   string;
}

export async function getAuditLogsAction(
  tenantId?: string | null,
  limit = 200,
): Promise<{ logs: AuditLogEntry[]; error?: string }> {
  const admin = getSupabaseAdminClient();

  let query = admin
    .from('audit_logs')
    .select('id, tenant_id, actor_id, actor_email, action, entity_type, entity_id, description, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data, error } = await query;
  if (error) return { logs: [], error: error.message };

  // Resolve tenant names for platform-wide view
  let tenantNames: Record<string, string> = {};
  if (!tenantId && data && data.length > 0) {
    const ids = [...new Set(data.map(r => r.tenant_id).filter(Boolean))] as string[];
    if (ids.length > 0) {
      const { data: tenants } = await admin.from('tenants').select('id, name').in('id', ids);
      for (const t of tenants ?? []) tenantNames[t.id] = t.name;
    }
  }

  const logs: AuditLogEntry[] = (data ?? []).map(r => ({
    ...r,
    tenant_name: r.tenant_id ? (tenantNames[r.tenant_id] ?? null) : null,
    metadata: r.metadata as Record<string, unknown> | null,
  }));

  return { logs };
}

/** Called from the client dashboard — scoped to the session's tenant, admin/manager only. */
export async function getClientAuditLogsAction(
  limit = 300,
): Promise<{ logs: AuditLogEntry[]; error?: string }> {
  const session = await getSession();
  if (!session) return { logs: [], error: 'Not authenticated' };

  if (!['admin', 'client_manager'].includes(session.role)) {
    return { logs: [], error: 'Insufficient permissions' };
  }

  return getAuditLogsAction(session.tenantId, limit);
}
