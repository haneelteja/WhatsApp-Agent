import type { FastifyInstance } from 'fastify';
import { getServerClient } from '@alphabot/database';
import { requireAuth } from '../../middleware/auth.js';

export async function escalationRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/escalations — list pending escalations for this tenant
  fastify.get('/', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();

    const { data, error } = await db
      .from('escalations')
      .select(`
        *,
        conversations(
          id,
          product_type,
          status,
          tenant_id,
          contacts(phone, name)
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) return reply.status(500).send({ success: false, error: error.message });

    // Filter to this tenant (escalations table has no tenant_id column, filter via conversation)
    const tenantEscalations = (data ?? []).filter(
      (e) => (e.conversations as { tenant_id?: string } | null)?.tenant_id === request.tenantId
    );

    return { success: true, data: tenantEscalations };
  });
}
