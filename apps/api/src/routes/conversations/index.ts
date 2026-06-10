import type { FastifyInstance } from 'fastify';
import { getServerClient } from '@alphabot/database';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { WhatsAppGateway } from '../../services/whatsapp/gateway.js';
import { claimEscalation, releaseToBot } from '../../services/escalation/index.js';
import type { Conversation } from '@alphabot/shared';

export async function conversationRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── GET /api/conversations — list all for tenant ─────────────────────────
  fastify.get('/', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();
    const { status, product_type, limit = '50', offset = '0' } = request.query as Record<string, string>;

    let query = db
      .from('conversations')
      .select(`
        *,
        contact:contacts(*),
        last_message:messages(id, content, role, timestamp)
      `)
      .eq('tenant_id', request.tenantId)
      .order('updated_at', { ascending: false })
      .limit(Number(limit))
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq('status', status);
    if (product_type) query = query.eq('product_type', product_type);

    const { data, error } = await query;
    if (error) return reply.status(500).send({ success: false, error: error.message });

    return { success: true, data };
  });

  // ─── GET /api/conversations/:id — single conversation with messages ───────
  fastify.get<{ Params: { id: string } }>('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();

    const { data, error } = await db
      .from('conversations')
      .select(`
        *,
        contact:contacts(*),
        messages(*),
        escalation:escalations(*)
      `)
      .eq('id', request.params.id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (error || !data) return reply.status(404).send({ success: false, error: 'Not found' });

    return { success: true, data };
  });

  // ─── GET /api/conversations/:id/messages ──────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id/messages', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();

    // Verify conversation belongs to this tenant
    const { data: convo } = await db
      .from('conversations')
      .select('id')
      .eq('id', request.params.id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (!convo) return reply.status(404).send({ success: false, error: 'Not found' });

    const { data: messages, error } = await db
      .from('messages')
      .select('*')
      .eq('conversation_id', request.params.id)
      .order('timestamp', { ascending: true });

    if (error) return reply.status(500).send({ success: false, error: error.message });

    return { success: true, data: messages };
  });

  // ─── POST /api/conversations/:id/send — manual agent send ────────────────
  fastify.post<{
    Params: { id: string };
    Body: { message: string };
  }>('/:id/send', { preHandler: [requireAuth] }, async (request, reply) => {
    const { message } = request.body;
    if (!message?.trim()) {
      return reply.status(400).send({ success: false, error: 'Message is required' });
    }

    const db = getServerClient();

    const { data: convo } = await db
      .from('conversations')
      .select('*, contact:contacts(phone), whatsapp_number:whatsapp_numbers(config_json, provider)')
      .eq('id', request.params.id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (!convo) return reply.status(404).send({ success: false, error: 'Not found' });

    const conversation = convo as Conversation & {
      contact: { phone: string };
      whatsapp_number: { config_json: { phone_number_id: string; access_token: string }; provider: string };
    };

    const { config_json, provider } = conversation.whatsapp_number;
    const gateway = new WhatsAppGateway(provider as 'meta_cloud');

    const result = await gateway.sendMessage(
      config_json.phone_number_id,
      config_json.access_token,
      { type: 'text', to: conversation.contact.phone, text: message }
    );

    if (result.status === 'failed') {
      return reply.status(502).send({ success: false, error: result.error });
    }

    await db.from('messages').insert({
      conversation_id: request.params.id,
      role: 'assistant',
      content: message,
      whatsapp_msg_id: result.messageId,
    });

    await db.from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', request.params.id);

    return { success: true, data: { messageId: result.messageId } };
  });

  // ─── PATCH /api/conversations/:id — update status ────────────────────────
  fastify.patch<{
    Params: { id: string };
    Body: { status?: string; assigned_agent_id?: string | null };
  }>('/:id', { preHandler: [requireAuth, requireRole('admin', 'supervisor', 'agent')] }, async (request, reply) => {
    const db = getServerClient();
    const allowed = ['open', 'escalated', 'resolved', 'bot_paused'];

    if (request.body.status && !allowed.includes(request.body.status)) {
      return reply.status(400).send({ success: false, error: 'Invalid status' });
    }

    const { data, error } = await db
      .from('conversations')
      .update({
        ...(request.body.status && { status: request.body.status }),
        ...(request.body.assigned_agent_id !== undefined && {
          assigned_agent_id: request.body.assigned_agent_id,
        }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.params.id)
      .eq('tenant_id', request.tenantId)
      .select()
      .single();

    if (error) return reply.status(500).send({ success: false, error: error.message });

    return { success: true, data };
  });

  // ─── POST /api/conversations/:id/claim — agent claims escalation ──────────
  fastify.post<{
    Params: { id: string };
    Body: { escalationId: string };
  }>('/:id/claim', { preHandler: [requireAuth] }, async (request, reply) => {
    await claimEscalation(
      request.params.id,
      request.body.escalationId,
      request.userId
    );
    return { success: true };
  });

  // ─── POST /api/conversations/:id/release — release back to bot ───────────
  fastify.post<{
    Params: { id: string };
    Body: { resolutionNote?: string };
  }>('/:id/release', { preHandler: [requireAuth] }, async (request, reply) => {
    await releaseToBot(request.params.id, request.userId, request.body.resolutionNote);
    return { success: true };
  });
}
