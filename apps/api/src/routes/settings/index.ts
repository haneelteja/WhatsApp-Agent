import type { FastifyInstance } from 'fastify';
import { getServerClient } from '@alphabot/database';
import { requireAuth } from '../../middleware/auth.js';

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/settings/notifications
  fastify.get('/notifications', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();
    const { data } = await db
      .from('tenant_notification_settings')
      .select('*')
      .eq('tenant_id', request.tenantId)
      .single();

    // Return defaults if no row yet
    return {
      success: true,
      data: data ?? {
        escalation_emails: [],
        escalation_wa_numbers: [],
        escalation_customer_message: 'Your query has been escalated to our team. A team member will get back to you shortly.',
      },
    };
  });

  // PATCH /api/settings/notifications
  fastify.patch<{
    Body: {
      escalation_emails?: string[];
      escalation_wa_numbers?: string[];
      escalation_customer_message?: string;
    };
  }>('/notifications', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();
    const { escalation_emails, escalation_wa_numbers, escalation_customer_message } = request.body;

    const { data, error } = await db
      .from('tenant_notification_settings')
      .upsert({
        tenant_id: request.tenantId,
        ...(escalation_emails !== undefined && { escalation_emails }),
        ...(escalation_wa_numbers !== undefined && { escalation_wa_numbers }),
        ...(escalation_customer_message !== undefined && { escalation_customer_message }),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' })
      .select()
      .single();

    if (error) return reply.status(500).send({ success: false, error: error.message });
    return { success: true, data };
  });
}
