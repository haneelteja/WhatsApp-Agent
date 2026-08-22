// CRUD routes for interactive button templates.
//
// GET    /api/button-templates/:tenantId          — list all active templates
// POST   /api/button-templates/:tenantId          — create
// PUT    /api/button-templates/:tenantId/:id      — update
// DELETE /api/button-templates/:tenantId/:id      — delete (soft: is_active=false)

import type { FastifyInstance } from 'fastify';
import { getServerClient } from '@alphabot/database';

interface ButtonTemplateRow {
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

interface UpsertBody {
  product_slug?:     string | null;
  name:              string;
  description?:      string | null;
  type:              'quick_reply' | 'list' | 'cta_url';
  template_json:     Record<string, unknown>;
  trigger_keywords?: string[];
  is_active?:        boolean;
}

export async function buttonTemplateRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /:tenantId ─────────────────────────────────────────────────────────
  fastify.get<{ Params: { tenantId: string }; Querystring: { product_slug?: string; include_inactive?: string } }>(
    '/:tenantId',
    async (request, reply) => {
      const { tenantId } = request.params;
      const { product_slug, include_inactive } = request.query;

      const db = getServerClient();
      let query = db
        .from('interactive_button_templates')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });

      if (include_inactive !== 'true') query = query.eq('is_active', true);
      if (product_slug) {
        query = query.or(`product_slug.eq.${product_slug},product_slug.is.null`);
      }

      const { data, error } = await query;
      if (error) return reply.status(500).send({ error: error.message });

      return reply.send(data ?? []);
    },
  );

  // ── POST /:tenantId ───────────────────────────────────────────────────────
  fastify.post<{ Params: { tenantId: string }; Body: UpsertBody }>(
    '/:tenantId',
    async (request, reply) => {
      const { tenantId } = request.params;
      const body = request.body;

      if (!body.name?.trim())        return reply.status(400).send({ error: 'name is required' });
      if (!body.type)                return reply.status(400).send({ error: 'type is required' });
      if (!body.template_json)       return reply.status(400).send({ error: 'template_json is required' });

      const validTypes = ['quick_reply', 'list', 'cta_url'] as const;
      if (!validTypes.includes(body.type as typeof validTypes[number])) {
        return reply.status(400).send({ error: 'type must be quick_reply, list, or cta_url' });
      }

      const db = getServerClient();
      const { data, error } = await db
        .from('interactive_button_templates')
        .insert({
          tenant_id:        tenantId,
          product_slug:     body.product_slug ?? null,
          name:             body.name.trim().toLowerCase().replace(/\s+/g, '_'),
          description:      body.description ?? null,
          type:             body.type,
          template_json:    body.template_json,
          trigger_keywords: body.trigger_keywords ?? [],
          is_active:        body.is_active ?? true,
        })
        .select('*')
        .single();

      if (error) {
        if (error.code === '23505') return reply.status(409).send({ error: 'A template with this name already exists for this tenant' });
        return reply.status(500).send({ error: error.message });
      }

      return reply.status(201).send(data as ButtonTemplateRow);
    },
  );

  // ── PUT /:tenantId/:id ────────────────────────────────────────────────────
  fastify.put<{ Params: { tenantId: string; id: string }; Body: Partial<UpsertBody> }>(
    '/:tenantId/:id',
    async (request, reply) => {
      const { tenantId, id } = request.params;
      const body = request.body;

      const updates: Record<string, unknown> = {};
      if (body.name             !== undefined) updates['name']             = body.name.trim().toLowerCase().replace(/\s+/g, '_');
      if (body.description      !== undefined) updates['description']      = body.description;
      if (body.product_slug     !== undefined) updates['product_slug']     = body.product_slug;
      if (body.type             !== undefined) updates['type']             = body.type;
      if (body.template_json    !== undefined) updates['template_json']    = body.template_json;
      if (body.trigger_keywords !== undefined) updates['trigger_keywords'] = body.trigger_keywords;
      if (body.is_active        !== undefined) updates['is_active']        = body.is_active;

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({ error: 'No fields to update' });
      }

      const db = getServerClient();
      const { data, error } = await db
        .from('interactive_button_templates')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('*')
        .single();

      if (error) return reply.status(500).send({ error: error.message });
      if (!data)  return reply.status(404).send({ error: 'Template not found' });

      return reply.send(data as ButtonTemplateRow);
    },
  );

  // ── DELETE /:tenantId/:id ─────────────────────────────────────────────────
  fastify.delete<{ Params: { tenantId: string; id: string } }>(
    '/:tenantId/:id',
    async (request, reply) => {
      const { tenantId, id } = request.params;

      const db = getServerClient();
      const { error } = await db
        .from('interactive_button_templates')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) return reply.status(500).send({ error: error.message });

      return reply.status(204).send();
    },
  );
}
