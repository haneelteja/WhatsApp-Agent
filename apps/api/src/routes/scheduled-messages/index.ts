// Scheduled Messages API
//
// GET    /api/scheduled-messages/:tenantId           — list
// POST   /api/scheduled-messages/:tenantId           — create
// GET    /api/scheduled-messages/:tenantId/:id       — detail
// PUT    /api/scheduled-messages/:tenantId/:id       — update (draft/scheduled only)
// DELETE /api/scheduled-messages/:tenantId/:id       — cancel
// GET    /api/scheduled-messages/:tenantId/:id/log   — recipient log
// GET    /api/scheduled-messages/:tenantId/templates — fetch live Meta HSM templates

import type { FastifyInstance } from 'fastify';
import { getServerClient } from '@alphabot/database';
import { requireAuth } from '../../middleware/auth.js';

interface CreateBody {
  name: string;
  message_body?: string;
  template_name?: string;
  template_language?: string;
  template_components?: unknown[];
  scheduled_at: string;
  recurrence?: { type: string; days_of_week?: number[]; day_of_month?: number };
  bot_handles_replies?: boolean;
  recipients: { phone: string; contact_name?: string; contact_id?: string }[];
}

export async function scheduledMessageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  // ─── GET /:tenantId — list ───────────────────────────────────────────────
  fastify.get<{ Params: { tenantId: string }; Querystring: { page?: string; status?: string } }>(
    '/:tenantId',
    async (request, reply) => {
      const tenantId  = request.tenantId;
      const { page = '1', status } = request.query;
      const pageSize  = 20;
      const offset    = (parseInt(page, 10) - 1) * pageSize;
      const db        = getServerClient();

      let query = db
        .from('scheduled_messages')
        .select('id, name, message_body, template_name, scheduled_at, recurrence, bot_handles_replies, status, failure_reason, created_at', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .neq('status', 'cancelled')
        .order('scheduled_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (status) query = query.eq('status', status);

      const { data, count, error } = await query;
      if (error) return reply.status(500).send({ error: error.message });

      // Attach recipient counts
      const ids = (data ?? []).map(m => m.id);
      const { data: counts } = ids.length > 0
        ? await db.from('scheduled_message_recipients')
            .select('scheduled_message_id, status')
            .in('scheduled_message_id', ids)
        : { data: [] };

      const countMap: Record<string, { total: number; sent: number; failed: number }> = {};
      for (const r of counts ?? []) {
        const mid = r.scheduled_message_id as string;
        if (!countMap[mid]) countMap[mid] = { total: 0, sent: 0, failed: 0 };
        countMap[mid]!.total++;
        if (r.status === 'sent' || r.status === 'delivered' || r.status === 'read') countMap[mid]!.sent++;
        if (r.status === 'failed' || r.status === 'skipped') countMap[mid]!.failed++;
      }

      const enriched = (data ?? []).map(m => ({ ...m, recipients: countMap[m.id] ?? { total: 0, sent: 0, failed: 0 } }));
      return { messages: enriched, total: count ?? 0, page: parseInt(page, 10) };
    },
  );

  // ─── POST /:tenantId — create ────────────────────────────────────────────
  fastify.post<{ Params: { tenantId: string }; Body: CreateBody }>(
    '/:tenantId',
    async (request, reply) => {
      const tenantId = request.tenantId;
      const body     = request.body;
      const db       = getServerClient();

      if (!body?.name)          return reply.status(400).send({ error: 'name is required' });
      if (!body?.scheduled_at)  return reply.status(400).send({ error: 'scheduled_at is required' });
      if (!body?.recipients?.length) return reply.status(400).send({ error: 'at least one recipient is required' });
      if (!body.message_body && !body.template_name)
        return reply.status(400).send({ error: 'message_body or template_name is required' });

      const { data: msg, error: msgErr } = await db
        .from('scheduled_messages')
        .insert({
          tenant_id:           tenantId,
          name:                body.name,
          message_body:        body.message_body ?? null,
          template_name:       body.template_name ?? null,
          template_language:   body.template_language ?? 'en',
          template_components: body.template_components ?? [],
          scheduled_at:        body.scheduled_at,
          recurrence:          body.recurrence ?? { type: 'once' },
          bot_handles_replies: body.bot_handles_replies ?? false,
          status:              'scheduled',
          created_by:          request.userId ?? null,
        })
        .select('id')
        .single();

      if (msgErr || !msg) return reply.status(500).send({ error: msgErr?.message ?? 'Insert failed' });

      // Insert recipients
      const recipientRows = body.recipients.map(r => ({
        scheduled_message_id: msg.id,
        tenant_id:            tenantId,
        phone:                r.phone,
        contact_name:         r.contact_name ?? null,
        contact_id:           r.contact_id ?? null,
        status:               'pending',
      }));
      const { error: recErr } = await db
        .from('scheduled_message_recipients')
        .insert(recipientRows);

      if (recErr) {
        await db.from('scheduled_messages').delete().eq('id', msg.id);
        return reply.status(500).send({ error: recErr.message });
      }

      return reply.status(201).send({ id: msg.id });
    },
  );

  // ─── GET /:tenantId/templates — fetch live Meta HSM templates ────────────
  fastify.get<{ Params: { tenantId: string } }>(
    '/:tenantId/templates',
    async (request, reply) => {
      const tenantId = request.tenantId;
      const db       = getServerClient();

      const { data: wn } = await db
        .from('whatsapp_numbers')
        .select('provider, config_json')
        .eq('tenant_id', tenantId)
        .eq('active', true)
        .limit(1)
        .single();

      if (!wn) return reply.status(404).send({ error: 'No active WhatsApp number found' });
      if (wn.provider !== 'meta_cloud')
        return reply.status(200).send({ templates: [], note: 'Template fetching only supported for Meta Cloud API' });

      const cfg = wn.config_json as { phone_number_id: string; access_token: string; waba_id?: string };

      // Resolve WABA ID — use stored value or look it up from the phone number object
      let wabaId = cfg.waba_id;
      if (!wabaId) {
        try {
          const pnRes = await fetch(
            `https://graph.facebook.com/v20.0/${cfg.phone_number_id}?fields=account_id&access_token=${cfg.access_token}`
          );
          const pnData = await pnRes.json() as { account_id?: string; error?: { message: string } };
          if (pnData.error) return reply.status(502).send({ error: `Meta API: ${pnData.error.message}` });
          wabaId = pnData.account_id;
        } catch {
          return reply.status(502).send({ error: 'Failed to resolve WABA ID from Meta API' });
        }
      }

      if (!wabaId) return reply.status(502).send({ error: 'Could not determine WABA ID' });

      try {
        const res = await fetch(
          `https://graph.facebook.com/v20.0/${wabaId}/message_templates?fields=name,status,language,category,components&limit=100&access_token=${cfg.access_token}`
        );
        const data = await res.json() as { data?: unknown[]; error?: { message: string } };
        if (data.error) return reply.status(502).send({ error: `Meta API: ${data.error.message}` });

        // Filter only APPROVED templates
        const approved = ((data.data ?? []) as { status?: string }[]).filter(t => t.status === 'APPROVED');
        return { templates: approved };
      } catch {
        return reply.status(502).send({ error: 'Failed to fetch templates from Meta API' });
      }
    },
  );

  // ─── GET /:tenantId/:id — detail ─────────────────────────────────────────
  fastify.get<{ Params: { tenantId: string; id: string } }>(
    '/:tenantId/:id',
    async (request, reply) => {
      const { id } = request.params;
      const tenantId = request.tenantId;
      const db = getServerClient();

      const { data, error } = await db
        .from('scheduled_messages')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !data) return reply.status(404).send({ error: 'Not found' });
      return data;
    },
  );

  // ─── PUT /:tenantId/:id — update ─────────────────────────────────────────
  fastify.put<{ Params: { tenantId: string; id: string }; Body: Partial<CreateBody> }>(
    '/:tenantId/:id',
    async (request, reply) => {
      const { id } = request.params;
      const tenantId = request.tenantId;
      const body     = request.body;
      const db       = getServerClient();

      const { data: existing } = await db
        .from('scheduled_messages')
        .select('status')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (!existing) return reply.status(404).send({ error: 'Not found' });
      if (!['draft', 'scheduled'].includes(existing.status))
        return reply.status(400).send({ error: `Cannot edit a message with status: ${existing.status}` });

      const updates: Record<string, unknown> = {};
      if (body.name             !== undefined) updates['name']                = body.name;
      if (body.message_body     !== undefined) updates['message_body']        = body.message_body;
      if (body.template_name    !== undefined) updates['template_name']       = body.template_name;
      if (body.template_language !== undefined) updates['template_language']  = body.template_language;
      if (body.template_components !== undefined) updates['template_components'] = body.template_components;
      if (body.scheduled_at     !== undefined) updates['scheduled_at']        = body.scheduled_at;
      if (body.recurrence       !== undefined) updates['recurrence']          = body.recurrence;
      if (body.bot_handles_replies !== undefined) updates['bot_handles_replies'] = body.bot_handles_replies;

      const { error } = await db
        .from('scheduled_messages')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) return reply.status(500).send({ error: error.message });

      // Replace recipients if provided
      if (body.recipients?.length) {
        await db.from('scheduled_message_recipients').delete().eq('scheduled_message_id', id);
        const rows = body.recipients.map(r => ({
          scheduled_message_id: id,
          tenant_id:            tenantId,
          phone:                r.phone,
          contact_name:         r.contact_name ?? null,
          contact_id:           r.contact_id ?? null,
          status:               'pending',
        }));
        await db.from('scheduled_message_recipients').insert(rows);
      }

      return { ok: true };
    },
  );

  // ─── DELETE /:tenantId/:id — cancel ──────────────────────────────────────
  fastify.delete<{ Params: { tenantId: string; id: string } }>(
    '/:tenantId/:id',
    async (request, reply) => {
      const { id } = request.params;
      const tenantId = request.tenantId;
      const db = getServerClient();

      const { data: existing } = await db
        .from('scheduled_messages')
        .select('status')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (!existing) return reply.status(404).send({ error: 'Not found' });
      if (['completed', 'cancelled'].includes(existing.status))
        return reply.status(400).send({ error: 'Message is already completed or cancelled' });

      await db
        .from('scheduled_messages')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .eq('tenant_id', tenantId);

      return { ok: true };
    },
  );

  // ─── GET /:tenantId/:id/log — recipient log ───────────────────────────────
  fastify.get<{ Params: { tenantId: string; id: string }; Querystring: { page?: string } }>(
    '/:tenantId/:id/log',
    async (request, reply) => {
      const { id } = request.params;
      const tenantId = request.tenantId;
      const { page = '1' } = request.query;
      const pageSize = 50;
      const offset   = (parseInt(page, 10) - 1) * pageSize;
      const db       = getServerClient();

      const { data, count, error } = await db
        .from('scheduled_message_recipients')
        .select('id, phone, contact_name, session_status, message_type, status, whatsapp_message_id, conversation_id, error_message, sent_at, delivered_at, read_at', { count: 'exact' })
        .eq('scheduled_message_id', id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) return reply.status(500).send({ error: error.message });
      return { recipients: data ?? [], total: count ?? 0, page: parseInt(page, 10) };
    },
  );
}
