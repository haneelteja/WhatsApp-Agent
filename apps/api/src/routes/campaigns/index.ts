// Campaign API routes.
//
// POST   /api/campaigns/:tenantId          — create campaign
// GET    /api/campaigns/:tenantId          — list campaigns
// GET    /api/campaigns/:tenantId/:id      — campaign detail + contacts
// POST   /api/campaigns/:tenantId/:id/launch  — start campaign
// POST   /api/campaigns/:tenantId/:id/pause   — pause campaign
// POST   /api/campaigns/:tenantId/:id/cancel  — cancel campaign
// GET    /api/campaigns/:tenantId/:id/contacts — contact list + status

import type { FastifyInstance } from 'fastify';
import { getServerClient } from '@alphabot/database';
import {
  createCampaign,
  launchCampaign,
  pauseCampaign,
  cancelCampaign,
} from '../../services/campaign/index.js';
import type { CreateCampaignRequest } from '@alphabot/shared';
import { requireAuth } from '../../middleware/auth.js';

export async function campaignRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.addHook('preHandler', requireAuth);

  // ─── POST /api/campaigns/:tenantId ───────────────────────────────────────
  fastify.post<{ Params: { tenantId: string }; Body: CreateCampaignRequest }>(
    '/:tenantId',
    async (request, reply) => {
      const tenantId = request.tenantId; // from verified JWT, ignores param
      const body = request.body;

      if (!body?.name || !body?.channel || !body?.product_slug) {
        return reply.status(400).send({ error: 'name, channel, and product_slug are required' });
      }
      if (!body.contacts || body.contacts.length === 0) {
        return reply.status(400).send({ error: 'contacts list cannot be empty' });
      }
      if (body.contacts.length > 10_000) {
        return reply.status(400).send({ error: 'Maximum 10,000 contacts per campaign' });
      }

      try {
        const campaignId = await createCampaign(tenantId, body);
        return reply.status(201).send({ id: campaignId });
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  // ─── GET /api/campaigns/:tenantId ────────────────────────────────────────
  fastify.get<{ Params: { tenantId: string }; Querystring: { page?: string; channel?: string; status?: string } }>(
    '/:tenantId',
    async (request, reply) => {
      const tenantId = request.tenantId;
      const { page = '1', channel, status } = request.query;
      const pageSize = 20;
      const offset   = (parseInt(page, 10) - 1) * pageSize;

      const db = getServerClient();
      let query = db
        .from('campaigns')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (channel) query = query.eq('channel', channel);
      if (status)  query = query.eq('status', status);

      const { data, count, error } = await query;
      if (error) return reply.status(500).send({ error: error.message });

      return reply.send({ campaigns: data ?? [], total: count ?? 0, page: parseInt(page, 10) });
    },
  );

  // ─── GET /api/campaigns/:tenantId/:id ────────────────────────────────────
  fastify.get<{ Params: { tenantId: string; id: string } }>(
    '/:tenantId/:id',
    async (request, reply) => {
      const tenantId = request.tenantId;
      const { id } = request.params;
      const db = getServerClient();

      const { data, error } = await db
        .from('campaigns')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !data) return reply.status(404).send({ error: 'Campaign not found' });
      return reply.send(data);
    },
  );

  // ─── POST /api/campaigns/:tenantId/:id/launch ─────────────────────────────
  fastify.post<{ Params: { tenantId: string; id: string } }>(
    '/:tenantId/:id/launch',
    async (request, reply) => {
      const tenantId = request.tenantId;
      const { id } = request.params;
      try {
        await launchCampaign(id, tenantId);
        return reply.send({ ok: true, status: 'running' });
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  // ─── POST /api/campaigns/:tenantId/:id/pause ──────────────────────────────
  fastify.post<{ Params: { tenantId: string; id: string } }>(
    '/:tenantId/:id/pause',
    async (request, reply) => {
      const tenantId = request.tenantId;
      const { id } = request.params;
      await pauseCampaign(id, tenantId);
      return reply.send({ ok: true, status: 'paused' });
    },
  );

  // ─── POST /api/campaigns/:tenantId/:id/cancel ─────────────────────────────
  fastify.post<{ Params: { tenantId: string; id: string } }>(
    '/:tenantId/:id/cancel',
    async (request, reply) => {
      const tenantId = request.tenantId;
      const { id } = request.params;
      await cancelCampaign(id, tenantId);
      return reply.send({ ok: true, status: 'cancelled' });
    },
  );

  // ─── GET /api/campaigns/:tenantId/:id/contacts ────────────────────────────
  fastify.get<{
    Params:      { tenantId: string; id: string };
    Querystring: { page?: string; voice_status?: string; whatsapp_status?: string };
  }>(
    '/:tenantId/:id/contacts',
    async (request, reply) => {
      const tenantId = request.tenantId;
      const { id } = request.params;
      const { page = '1', voice_status, whatsapp_status } = request.query;
      const pageSize = 50;
      const offset   = (parseInt(page, 10) - 1) * pageSize;

      const db = getServerClient();
      let query = db
        .from('campaign_contacts')
        .select('*', { count: 'exact' })
        .eq('campaign_id', id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (voice_status)    query = query.eq('voice_status', voice_status);
      if (whatsapp_status) query = query.eq('whatsapp_status', whatsapp_status);

      const { data, count, error } = await query;
      if (error) return reply.status(500).send({ error: error.message });

      return reply.send({ contacts: data ?? [], total: count ?? 0, page: parseInt(page, 10) });
    },
  );
}
