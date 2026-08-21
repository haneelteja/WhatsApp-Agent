import type { FastifyInstance } from 'fastify';
import { getServerClient } from '@alphabot/database';

// POST /api/inbound/leads?key=<uuid>
// Public endpoint — authenticated via per-tenant inbound_webhook_key.
// Used by Zapier, Make.com, or any external system to push leads into the sales CRM.
export async function inboundRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{
    Querystring: { key?: string };
    Body: {
      phone: string;
      name?: string;
      notes?: string;
      source?: string;
    };
  }>('/leads', async (request, reply) => {
    const { key } = request.query;
    if (!key) return reply.status(401).send({ success: false, error: 'Missing API key' });

    const db = getServerClient();

    // ── 1. Resolve tenant by webhook key ───────────────────────────────────────
    const { data: tenant, error: tenantErr } = await db
      .from('tenants')
      .select('id')
      .eq('inbound_webhook_key', key)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return reply.status(401).send({ success: false, error: 'Invalid API key' });
    }
    const tenantId = (tenant as { id: string }).id;

    // ── 2. Validate body ────────────────────────────────────────────────────────
    const { phone, name, notes, source } = request.body ?? {};
    if (!phone || typeof phone !== 'string') {
      return reply.status(400).send({ success: false, error: 'phone is required' });
    }
    const normalizedPhone = phone.replace(/\s+/g, '').replace(/^00/, '+');

    // ── 3. Upsert contact ───────────────────────────────────────────────────────
    const { data: contact, error: contactErr } = await db
      .from('contacts')
      .upsert(
        { tenant_id: tenantId, phone: normalizedPhone, name: name ?? null },
        { onConflict: 'tenant_id,phone', ignoreDuplicates: false },
      )
      .select('id')
      .single();

    if (contactErr || !contact) {
      fastify.log.error({ err: contactErr }, 'inbound-leads: contact upsert failed');
      return reply.status(500).send({ success: false, error: 'Failed to create contact' });
    }
    const contactId = (contact as { id: string }).id;

    // ── 4. Deduplicate — skip if active lead already exists for this contact ────
    const { data: existing } = await db
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
      .eq('product_type', 'sales_bot')
      .in('status', ['open', 'escalated'])
      .maybeSingle();

    if (existing) {
      return reply.status(200).send({
        success: true,
        lead_id:    (existing as { id: string }).id,
        deduplicated: true,
      });
    }

    // ── 5. Create conversation ──────────────────────────────────────────────────
    const sourceLabel = source ? `[Inbound: ${source}]` : '[Inbound lead]';
    const { data: conv, error: convErr } = await db
      .from('conversations')
      .insert({
        tenant_id:    tenantId,
        contact_id:   contactId,
        product_type: 'sales_bot',
        status:       'escalated',
        stage:        'qualifying',
        ai_vars:      source ? { lead_source: source } : {},
      })
      .select('id')
      .single();

    if (convErr || !conv) {
      fastify.log.error({ err: convErr }, 'inbound-leads: conversation insert failed');
      return reply.status(500).send({ success: false, error: 'Failed to create lead' });
    }
    const conversationId = (conv as { id: string }).id;

    // ── 6. Optionally store notes as first message ──────────────────────────────
    if (notes?.trim()) {
      await db.from('messages').insert({
        conversation_id: conversationId,
        role:            'user',
        content:         `${sourceLabel} ${notes.trim()}`,
        timestamp:       new Date().toISOString(),
      });
    }

    // ── 7. Create escalation record ─────────────────────────────────────────────
    await db.from('escalations').insert({
      tenant_id:       tenantId,
      conversation_id: conversationId,
      trigger_reason:  `inbound_lead${source ? `:${source}` : ''}`,
      status:          'pending',
    });

    return reply.status(201).send({ success: true, lead_id: conversationId });
  });
}
