// Integration webhook routes
//
// POST /api/integrations/webhook/contact
//   — inbound webhook called by external CRMs / Zapier / Make
//   — API-key auth via tenant_integrations.webhook_api_key
//   — sends a personalised welcome message, logs the result

import type { FastifyInstance } from 'fastify';
import { getServerClient }      from '@alphabot/database';
import { WhatsAppGateway }      from '../../services/whatsapp/gateway.js';
import type { WhatsAppProvider } from '@alphabot/shared';

interface ContactWebhookBody {
  phone:   string;
  name?:   string;
  source?: string; // 'hubspot' | 'zapier' | 'make' | etc.
}

export async function integrationRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.post<{ Body: ContactWebhookBody }>('/webhook/contact', async (request, reply) => {
    const db       = getServerClient();
    const apiKey   = (request.headers['x-api-key'] ?? '') as string;

    // ── 1. Resolve tenant from API key ────────────────────────────────────────
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

    const tenantId = integration.tenant_id as string;

    // ── 2. Validate body ──────────────────────────────────────────────────────
    const { phone, name, source } = request.body ?? {};
    if (!phone?.trim()) {
      return reply.status(400).send({ error: 'phone is required' });
    }

    const cleanPhone  = phone.trim();
    const cleanName   = name?.trim() || null;
    const cleanSource = source?.trim() || 'api';

    // ── 3. Duplicate check — already sent a welcome to this number this month ─
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
        tenant_id:     tenantId,
        contact_phone: cleanPhone,
        contact_name:  cleanName,
        status:        'duplicate',
        source:        cleanSource,
      });
      return reply.send({ sent: false, reason: 'already_welcomed_in_last_30_days' });
    }

    // ── 4. Find active WhatsApp number for this tenant ────────────────────────
    const { data: wn } = await db
      .from('whatsapp_numbers')
      .select('config_json, provider')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .limit(1)
      .single();

    if (!wn) {
      await db.from('webhook_logs').insert({
        tenant_id:     tenantId,
        contact_phone: cleanPhone,
        contact_name:  cleanName,
        status:        'failed',
        error_message: 'No active WhatsApp number configured for this tenant.',
        source:        cleanSource,
      });
      return reply.status(500).send({ error: 'No active WhatsApp number configured' });
    }

    // ── 5. Personalise and send ───────────────────────────────────────────────
    const firstName   = cleanName?.split(' ')[0] ?? 'there';
    const messageText = (integration.welcome_template as string)
      .replace(/\{name\}/gi, firstName);

    const gateway  = new WhatsAppGateway(wn.provider as WhatsAppProvider);
    const wnConfig = wn.config_json as { phone_number_id: string; access_token: string };

    try {
      await gateway.sendMessage(wnConfig.phone_number_id, wnConfig.access_token, {
        type: 'text',
        to:   cleanPhone,
        text: messageText,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      fastify.log.error({ err, tenantId, phone: cleanPhone }, '[Integration] Failed to send welcome message');

      await db.from('webhook_logs').insert({
        tenant_id:     tenantId,
        contact_phone: cleanPhone,
        contact_name:  cleanName,
        status:        'failed',
        error_message: errMsg,
        source:        cleanSource,
      });

      return reply.status(500).send({ error: 'Failed to send WhatsApp message', detail: errMsg });
    }

    // ── 6. Upsert contact so they appear in the Contacts tab ──────────────────
    await db.from('contacts').upsert(
      { tenant_id: tenantId, phone: cleanPhone, name: cleanName },
      { onConflict: 'tenant_id,phone', ignoreDuplicates: false },
    );

    // ── 7. Log success ────────────────────────────────────────────────────────
    await db.from('webhook_logs').insert({
      tenant_id:     tenantId,
      contact_phone: cleanPhone,
      contact_name:  cleanName,
      status:        'sent',
      source:        cleanSource,
    });

    return reply.send({ sent: true, phone: cleanPhone });
  });
}
