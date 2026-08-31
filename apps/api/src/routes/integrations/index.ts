// Integration routes
//
// Inbound:
//   POST /api/integrations/webhook/contact  — CRM/Zapier/Make triggers welcome message
//
// Outbound:
//   POST /api/integrations/outbound/push    — manual snapshot push to external system

import type { FastifyInstance } from 'fastify';
import { getServerClient }      from '@alphabot/database';
import { WhatsAppGateway }      from '../../services/whatsapp/gateway.js';
import { fireOutboundWebhook }  from '../../services/outbound/index.js';
import { requireAuth }          from '../../middleware/auth.js';
import { fireForget }           from '../../lib/fire-forget.js';
import type { WhatsAppProvider } from '@alphabot/shared';

// ─── Inbound: external CRM → welcome WhatsApp message ─────────────────────────

interface ContactWebhookBody {
  phone:   string;
  name?:   string;
  source?: string;
}

// ─── Outbound: manual push snapshot ──────────────────────────────────────────

interface ManualPushBody {
  type: 'contacts' | 'conversations' | 'leads';
}

export async function integrationRoutes(fastify: FastifyInstance): Promise<void> {

  // ── POST /api/integrations/webhook/contact ────────────────────────────────
  fastify.post<{ Body: ContactWebhookBody }>('/webhook/contact', async (request, reply) => {
    const db     = getServerClient();
    const apiKey = (request.headers['x-api-key'] ?? '') as string;

    if (!apiKey) {
      return reply.status(401).send({ error: 'x-api-key header is required' });
    }

    const { data: integration, error: integErr } = await db
      .from('tenant_integrations')
      .select('id, tenant_id, welcome_template, enabled')
      .eq('webhook_api_key', apiKey)
      .single();

    if (integErr || !integration) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    if (!integration.enabled) {
      return reply.status(403).send({ error: 'Integration is disabled for this account' });
    }

    const tenantId    = integration.tenant_id as string;
    const { phone, name, source } = request.body ?? {};

    if (!phone?.trim()) {
      return reply.status(400).send({ error: 'phone is required' });
    }

    const cleanPhone  = phone.trim();
    const cleanName   = name?.trim() || null;
    const cleanSource = source?.trim() || 'api';

    // Duplicate check — same phone, same tenant, last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: prior } = await db
      .from('webhook_logs')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('contact_phone', cleanPhone)
      .eq('status', 'sent')
      .gte('triggered_at', thirtyDaysAgo)
      .limit(1);

    if (prior && prior.length > 0) {
      await db.from('webhook_logs').insert({
        tenant_id: tenantId, contact_phone: cleanPhone,
        contact_name: cleanName, status: 'duplicate', source: cleanSource,
      });
      return reply.send({ sent: false, reason: 'already_welcomed_in_last_30_days' });
    }

    // Find active WhatsApp number
    const { data: wn } = await db
      .from('whatsapp_numbers')
      .select('config_json, provider')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .limit(1)
      .single();

    if (!wn) {
      await db.from('webhook_logs').insert({
        tenant_id: tenantId, contact_phone: cleanPhone, contact_name: cleanName,
        status: 'failed', error_message: 'No active WhatsApp number.', source: cleanSource,
      });
      return reply.status(500).send({ error: 'No active WhatsApp number configured' });
    }

    const firstName   = cleanName?.split(' ')[0] ?? 'there';
    const messageText = (integration.welcome_template as string).replace(/\{name\}/gi, firstName);
    const gateway     = new WhatsAppGateway(wn.provider as WhatsAppProvider);
    const wnConfig    = wn.config_json as { phone_number_id: string; access_token: string };

    try {
      await gateway.sendMessage(wnConfig.phone_number_id, wnConfig.access_token, {
        type: 'text', to: cleanPhone, text: messageText,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      fastify.log.error({ err, tenantId, phone: cleanPhone }, '[Integration] Failed to send welcome message');
      await db.from('webhook_logs').insert({
        tenant_id: tenantId, contact_phone: cleanPhone, contact_name: cleanName,
        status: 'failed', error_message: errMsg, source: cleanSource,
      });
      return reply.status(500).send({ error: 'Failed to send WhatsApp message', detail: errMsg });
    }

    // Upsert contact
    const { data: upsertedContact } = await db.from('contacts').upsert(
      { tenant_id: tenantId, phone: cleanPhone, name: cleanName },
      { onConflict: 'tenant_id,phone', ignoreDuplicates: false },
    ).select('id, phone, name, memory_json').single();

    // Log inbound success
    await db.from('webhook_logs').insert({
      tenant_id: tenantId, contact_phone: cleanPhone,
      contact_name: cleanName, status: 'sent', source: cleanSource,
    });

    // Fire outbound contact.created event (fire-and-forget)
    if (upsertedContact) {
      const contact = upsertedContact as { id: string; phone: string; name: string | null; memory_json: Record<string, unknown> | null };
      fireForget(
        fireOutboundWebhook(tenantId, 'contact.created', {
          id:    contact.id,
          phone: contact.phone,
          name:  contact.name,
          sentiment: (contact.memory_json as Record<string, unknown> | null)?.['sentiment'] ?? 'unknown',
          source: cleanSource,
        }, fastify.log),
        'outbound-contact-created',
        fastify.log,
      );
    }

    return reply.send({ sent: true, phone: cleanPhone });
  });

  // ── POST /api/integrations/outbound/push — manual data snapshot push ────────
  fastify.post<{ Body: ManualPushBody }>(
    '/outbound/push',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const db       = getServerClient();
      const tenantId = request.tenantId;
      const { type } = request.body ?? {};

      if (!['contacts', 'conversations', 'leads'].includes(type)) {
        return reply.status(400).send({ error: 'type must be: contacts | conversations | leads' });
      }

      // Verify outbound URL is configured
      const { data: integration } = await db
        .from('tenant_integrations')
        .select('outbound_webhook_url, outbound_signing_secret, enabled')
        .eq('tenant_id', tenantId)
        .single();

      if (!integration?.outbound_webhook_url) {
        return reply.status(400).send({ error: 'Outbound webhook URL is not configured' });
      }

      // Fetch the data snapshot
      let exportData: Record<string, unknown>[] = [];

      if (type === 'contacts') {
        const { data } = await db
          .from('contacts')
          .select('id, phone, name, memory_json, created_at, updated_at')
          .eq('tenant_id', tenantId)
          .order('updated_at', { ascending: false })
          .limit(1000);

        exportData = ((data ?? []) as Array<{
          id: string; phone: string | null; name: string | null;
          memory_json: Record<string, unknown> | null;
          created_at: string; updated_at: string;
        }>).map(c => ({
          id:         c.id,
          phone:      c.phone,
          name:       c.name,
          sentiment:  (c.memory_json as Record<string, unknown> | null)?.['sentiment'] ?? 'unknown',
          preferences: (c.memory_json as Record<string, unknown> | null)?.['preferences'] ?? {},
          open_issues: (c.memory_json as Record<string, unknown> | null)?.['open_issues'] ?? [],
          csat_score:  (c.memory_json as Record<string, unknown> | null)?.['csat_score'] ?? null,
          created_at: c.created_at,
          last_seen:  c.updated_at,
        }));

      } else if (type === 'conversations') {
        const { data } = await db
          .from('conversations')
          .select('id, product_type, status, stage, created_at, updated_at, contacts(phone, name)')
          .eq('tenant_id', tenantId)
          .order('updated_at', { ascending: false })
          .limit(500);

        exportData = ((data ?? []) as unknown as Array<{
          id: string; product_type: string; status: string; stage: string | null;
          created_at: string; updated_at: string;
          contacts: Array<{ phone: string | null; name: string | null }>;
        }>).map(c => ({
          id:           c.id,
          product_type: c.product_type,
          status:       c.status,
          stage:        c.stage,
          contact_phone: c.contacts?.[0]?.phone,
          contact_name:  c.contacts?.[0]?.name,
          created_at:   c.created_at,
          updated_at:   c.updated_at,
        }));

      } else {
        // leads — conversations with lead data
        const { data } = await db
          .from('conversations')
          .select('id, stage, lead_score, lead_json, created_at, updated_at, contacts(phone, name)')
          .eq('tenant_id', tenantId)
          .eq('product_type', 'sales_bot')
          .not('lead_json', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(500);

        exportData = ((data ?? []) as unknown as Array<{
          id: string; stage: string | null; lead_score: number | null;
          lead_json: Record<string, unknown> | null;
          created_at: string; updated_at: string;
          contacts: Array<{ phone: string | null; name: string | null }>;
        }>).map(c => ({
          conversation_id: c.id,
          stage:           c.stage,
          lead_score:      c.lead_score,
          contact_phone:   c.contacts?.[0]?.phone,
          contact_name:    c.contacts?.[0]?.name,
          lead_data:       c.lead_json ?? {},
          created_at:      c.created_at,
          updated_at:      c.updated_at,
        }));
      }

      // Fire the outbound webhook
      await fireOutboundWebhook(tenantId, 'data.export', {
        export_type: type,
        count:       exportData.length,
        records:     exportData,
      }, fastify.log);

      return reply.send({ pushed: true, type, count: exportData.length });
    },
  );
}
