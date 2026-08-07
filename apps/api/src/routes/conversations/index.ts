import type { FastifyInstance } from 'fastify';
import { getServerClient } from '@alphabot/database';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { WhatsAppGateway } from '../../services/whatsapp/gateway.js';
import { claimEscalation, releaseToBot } from '../../services/escalation/index.js';
import { summariseAndStoreConversation } from '../../services/contact/memory.js';
import { fireForget } from '../../lib/fire-forget.js';
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
        escalation:escalations(*)
      `)
      .eq('id', request.params.id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (error || !data) return reply.status(404).send({ success: false, error: 'Not found' });

    // Fetch latest 50 messages separately — embedded select has no limit support.
    // Older messages are available via GET /:id/messages?before=<id>&limit=50.
    const { data: messages } = await db
      .from('messages')
      .select('*')
      .eq('conversation_id', request.params.id)
      .order('timestamp', { ascending: false })
      .limit(50);

    return { success: true, data: { ...data, messages: (messages ?? []).reverse() } };
  });

  // ─── GET /api/conversations/:id/messages ──────────────────────────────────
  // Supports cursor-based pagination: ?before=<message_id>&limit=<n>
  // Returns messages in ascending order; hasMore=true means older pages exist.
  fastify.get<{ Params: { id: string } }>('/:id/messages', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();
    const { before, limit = '50' } = request.query as { before?: string; limit?: string };
    const pageSize = Math.min(Number(limit), 100);

    // Verify conversation belongs to this tenant
    const { data: convo } = await db
      .from('conversations')
      .select('id')
      .eq('id', request.params.id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (!convo) return reply.status(404).send({ success: false, error: 'Not found' });

    let query = db
      .from('messages')
      .select('*')
      .eq('conversation_id', request.params.id)
      .order('timestamp', { ascending: false })
      .limit(pageSize);

    if (before) {
      // Fetch the cursor message's timestamp, then filter
      const { data: cursor } = await db
        .from('messages')
        .select('timestamp')
        .eq('id', before)
        .single();
      if (cursor) {
        query = query.lt('timestamp', (cursor as { timestamp: string }).timestamp);
      }
    }

    const { data: messages, error } = await query;
    if (error) return reply.status(500).send({ success: false, error: error.message });

    // Return in ascending order for display; indicate whether older pages exist
    const ordered = ((messages ?? []) as Array<{ timestamp: string }>).reverse();
    return {
      success: true,
      data:    ordered,
      hasMore: (messages?.length ?? 0) === pageSize,
    };
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
      .select('*, contact:contacts(phone, bsuid)')
      .eq('id', request.params.id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (!convo) return reply.status(404).send({ success: false, error: 'Not found' });

    const conversation = convo as Conversation & { contact: { phone: string } };

    // Look up the WhatsApp number for this tenant + bot type separately
    const { data: wn } = await db
      .from('whatsapp_numbers')
      .select('config_json, provider')
      .eq('tenant_id', request.tenantId)
      .eq('product_slug', conversation.product_type)
      .eq('active', true)
      .limit(1)
      .single();

    if (!wn) return reply.status(404).send({ success: false, error: 'No active WhatsApp number found' });

    const { config_json, provider } = wn as { config_json: { phone_number_id: string; access_token: string }; provider: string };
    const gateway = new WhatsAppGateway(provider as 'meta_cloud');

    // For Twilio agent sends, strip the ContentSid so the message goes via plain
    // Body — agent sends are always session replies (within 24 h of customer msg)
    // and ContentVariables is a paid-only Twilio feature.
    const agentCredentials = provider === 'twilio'
      ? config_json.access_token.split('|')[0]!
      : config_json.access_token;

    // contact.phone may be null for BSUID-only contacts; fall back to bsuid
    const toPhone = (conversation.contact as { phone: string | null; bsuid?: string | null }).phone
      ?? (conversation.contact as { bsuid?: string | null }).bsuid
      ?? null;

    if (!toPhone) {
      return reply.status(422).send({ success: false, error: 'Contact has no phone number — cannot send WhatsApp message' });
    }

    const result = await gateway.sendMessage(
      config_json.phone_number_id,
      agentCredentials,
      { type: 'text', to: toPhone, text: message }
    );

    if (result.status === 'failed') {
      fastify.log.error({ error: result.error, provider, conversationId: request.params.id }, '[Send] WhatsApp send failed after retries');
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

    // When a conversation is resolved, summarise it and store in contact memory
    // so the bot can greet returning customers with context from prior sessions.
    if (request.body.status === 'resolved') {
      fireForget(
        summariseAndStoreConversation(request.params.id),
        'summarise-resolved-conversation',
        fastify.log,
      );
    }

    return { success: true, data };
  });

  // ─── POST /api/conversations/:id/claim — agent claims escalation ──────────
  fastify.post<{ Params: { id: string } }>(
    '/:id/claim',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const db = getServerClient();

      // Verify conversation belongs to this tenant before looking up its escalation
      const { data: convoCheck } = await db
        .from('conversations')
        .select('id, status')
        .eq('id', request.params.id)
        .eq('tenant_id', request.tenantId)
        .single();

      if (!convoCheck) return reply.status(404).send({ success: false, error: 'Not found' });

      const { data: esc } = await db
        .from('escalations')
        .select('id')
        .eq('conversation_id', request.params.id)
        .eq('tenant_id', request.tenantId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (esc) {
        // Normal path: escalation row exists — claim it properly
        try {
          await claimEscalation(request.params.id, (esc as { id: string }).id, request.userId);
        } catch (err) {
          return reply.status(409).send({ success: false, error: err instanceof Error ? err.message : 'Claim failed' });
        }
      } else {
        // Fallback: conversation is escalated but no escalation row exists
        // (can happen when the escalation insert previously failed mid-flight).
        // Do a direct takeover so the agent can still handle the conversation.
        await Promise.all([
          db.from('conversations').update({
            status:            'bot_paused',
            assigned_agent_id: request.userId,
          }).eq('id', request.params.id),
          db.from('agent_sessions').insert({
            conversation_id: request.params.id,
            agent_id:        request.userId,
          }),
        ]);
      }

      return { success: true };
    }
  );

  // ─── POST /api/conversations/:id/release — release back to bot ───────────
  fastify.post<{
    Params: { id: string };
    Body: { resolutionNote?: string };
  }>('/:id/release', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();

    const { data: convo } = await db
      .from('conversations')
      .select('id')
      .eq('id', request.params.id)
      .eq('tenant_id', request.tenantId)
      .single();

    if (!convo) return reply.status(404).send({ success: false, error: 'Not found' });

    await releaseToBot(request.params.id, request.userId, request.body?.resolutionNote);
    return { success: true };
  });

  // ─── POST /api/conversations/:id/takeover — agent takes over open conversation ─
  fastify.post<{ Params: { id: string } }>(
    '/:id/takeover',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const db = getServerClient();

      const { data: convo } = await db
        .from('conversations')
        .select('id')
        .eq('id', request.params.id)
        .eq('tenant_id', request.tenantId)
        .single();

      if (!convo) return reply.status(404).send({ success: false, error: 'Not found' });

      await Promise.all([
        db.from('conversations').update({
          status: 'bot_paused',
          assigned_agent_id: request.userId,
        }).eq('id', request.params.id),

        db.from('agent_sessions').insert({
          conversation_id: request.params.id,
          agent_id: request.userId,
        }),
      ]);

      return { success: true };
    }
  );

  // ─── PATCH /api/conversations/:id/stage — manual lead stage update ────────
  fastify.patch<{
    Params: { id: string };
    Body: { stage: string; mark_converted?: boolean };
  }>(
    '/:id/stage',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const VALID_STAGES = ['greeting', 'qualifying', 'resolving', 'following_up', 'closing'];
      const { stage, mark_converted } = request.body;

      if (!VALID_STAGES.includes(stage)) {
        return reply.status(400).send({ success: false, error: `Invalid stage. Must be one of: ${VALID_STAGES.join(', ')}` });
      }

      const db = getServerClient();

      const { data: convo } = await db
        .from('conversations')
        .select('id')
        .eq('id', request.params.id)
        .eq('tenant_id', request.tenantId)
        .single();

      if (!convo) return reply.status(404).send({ success: false, error: 'Not found' });

      const updates: Record<string, unknown> = { stage };
      if (mark_converted) {
        updates['status'] = 'resolved';
      } else {
        // Re-open if it was resolved and being moved back to an active stage
        updates['status'] = 'escalated';
      }

      const { error } = await db
        .from('conversations')
        .update(updates)
        .eq('id', request.params.id)
        .eq('tenant_id', request.tenantId);

      if (error) return reply.status(500).send({ success: false, error: error.message });
      return { success: true };
    }
  );
}
