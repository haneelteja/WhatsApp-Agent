// Broadcast API routes.
//
// POST /api/broadcast/trigger            — create & trigger a broadcast (API-key auth)
// POST /api/broadcast/:id/send           — execute a specific broadcast now (JWT auth)
// POST /api/broadcast/:id/cancel         — cancel a scheduled broadcast (JWT auth)
// GET  /api/broadcast/:tenantId/list     — list broadcasts for a tenant (JWT auth)

import type { FastifyInstance } from 'fastify';
import { getServerClient }      from '@alphabot/database';
import { executeBroadcast }     from '../../services/broadcast/index.js';
import { requireAuth }          from '../../middleware/auth.js';

interface TriggerBody {
  tenant_id:     string;
  name:          string;
  message:       string;
  audience_type: 'all' | 'recent_7d' | 'recent_10d' | 'groups';
  group_ids?:    string[];
  scheduled_at?: string;   // ISO 8601 — omit to send immediately
}

export async function broadcastRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── POST /api/broadcast/trigger (API-key auth — for external integrations) ──
  fastify.post<{ Body: TriggerBody }>('/trigger', async (request, reply) => {
    const apiKey = process.env['BROADCAST_API_KEY'] ?? process.env['API_SECRET'];
    const provided = request.headers['x-api-key'];
    if (!apiKey || provided !== apiKey) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    const { tenant_id, name, message, audience_type, group_ids = [], scheduled_at } = request.body ?? {};
    if (!tenant_id || !name || !message || !audience_type) {
      return reply.status(400).send({ error: 'tenant_id, name, message, and audience_type are required' });
    }
    if (!['all', 'recent_7d', 'recent_10d', 'groups'].includes(audience_type)) {
      return reply.status(400).send({ error: 'audience_type must be: all | recent_7d | recent_10d | groups' });
    }
    if (audience_type === 'groups' && (!group_ids || group_ids.length === 0)) {
      return reply.status(400).send({ error: 'group_ids is required when audience_type is "groups"' });
    }

    const db = getServerClient();
    const status = scheduled_at ? 'scheduled' : 'draft';

    const { data: bcast, error: insertErr } = await db
      .from('broadcast_messages')
      .insert({
        tenant_id,
        name,
        message,
        audience_type,
        group_ids,
        scheduled_at: scheduled_at ?? null,
        status,
      })
      .select('id')
      .single();

    if (insertErr || !bcast) {
      return reply.status(500).send({ error: insertErr?.message ?? 'Failed to create broadcast' });
    }

    const broadcastId = (bcast as { id: string }).id;

    if (!scheduled_at) {
      // Fire and forget — respond immediately, let execution happen in background
      void executeBroadcast(broadcastId).catch(err =>
        fastify.log.error({ err, broadcastId }, '[Broadcast] Background execution failed'),
      );
    }

    return reply.status(201).send({
      id:     broadcastId,
      status: scheduled_at ? 'scheduled' : 'sending',
      message: scheduled_at
        ? `Broadcast scheduled for ${scheduled_at}`
        : 'Broadcast queued — sending now',
    });
  });

  // ─── JWT-protected routes below ───────────────────────────────────────────────
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip JWT check for /trigger (already handled above)
    if (request.url.endsWith('/trigger')) return;
    await requireAuth(request, reply);
  });

  // ─── GET /api/broadcast/:tenantId/list ───────────────────────────────────────
  fastify.get<{ Params: { tenantId: string } }>('/:tenantId/list', async (request, reply) => {
    const tenantId = request.tenantId; // from JWT — ignore URL param
    const db = getServerClient();

    const { data, error } = await db
      .from('broadcast_messages')
      .select('id, name, message, audience_type, group_ids, scheduled_at, status, total_count, sent_count, failed_count, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return reply.status(500).send({ error: error.message });
    return { broadcasts: data ?? [] };
  });

  // ─── POST /api/broadcast/:id/send ────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>('/:id/send', async (request, reply) => {
    const tenantId = request.tenantId;
    const { id }   = request.params;
    const db = getServerClient();

    // Verify ownership
    const { data: bcast } = await db
      .from('broadcast_messages')
      .select('id, status')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (!bcast) return reply.status(404).send({ error: 'Broadcast not found' });
    if (!['draft', 'scheduled'].includes(bcast.status as string)) {
      return reply.status(400).send({ error: `Cannot send broadcast with status: ${bcast.status}` });
    }

    void executeBroadcast(id).catch(err =>
      fastify.log.error({ err, broadcastId: id }, '[Broadcast] Execution failed'),
    );

    return { queued: true };
  });

  // ─── POST /api/broadcast/:id/cancel ──────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>('/:id/cancel', async (request, reply) => {
    const tenantId = request.tenantId;
    const { id }   = request.params;
    const db = getServerClient();

    const { error } = await db
      .from('broadcast_messages')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .in('status', ['draft', 'scheduled']);

    if (error) return reply.status(500).send({ error: error.message });
    return { cancelled: true };
  });
}
