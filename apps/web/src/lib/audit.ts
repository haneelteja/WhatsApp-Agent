import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function writeAuditLog({
  tenantId,
  actorId,
  actorEmail,
  action,
  entityType,
  entityId,
  description,
  metadata,
}: {
  tenantId?:    string | null;
  actorId?:     string | null;
  actorEmail?:  string | null;
  action:       string;
  entityType?:  string | null;
  entityId?:    string | null;
  description:  string;
  metadata?:    Record<string, unknown> | null;
}) {
  const admin = getSupabaseAdminClient();
  await admin.from('audit_logs').insert({
    tenant_id:   tenantId   ?? null,
    actor_id:    actorId    ?? 'system',
    actor_email: actorEmail ?? null,
    action,
    entity_type: entityType ?? null,
    entity_id:   entityId   ?? null,
    description,
    metadata:    metadata   ?? null,
  });
}
