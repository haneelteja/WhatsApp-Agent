import type { FastifyInstance } from 'fastify';
import { getServerClient } from '@alphabot/database';
import { requireAuth } from '../../middleware/auth.js';

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/settings/notifications
  fastify.get('/notifications', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();
    const { data } = await db
      .from('tenant_notification_settings')
      .select('escalation_emails, escalation_wa_numbers, escalation_customer_message, from_email, resend_api_key')
      .eq('tenant_id', request.tenantId)
      .single();

    const row = data as {
      escalation_emails: string[] | null;
      escalation_wa_numbers: string[] | null;
      escalation_customer_message: string | null;
      from_email: string | null;
      resend_api_key: string | null;
    } | null;

    return {
      success: true,
      data: {
        escalation_emails:           row?.escalation_emails ?? [],
        escalation_wa_numbers:       row?.escalation_wa_numbers ?? [],
        escalation_customer_message: row?.escalation_customer_message ?? 'Your query has been escalated to our team. A team member will get back to you shortly.',
        from_email:                  row?.from_email ?? '',
        // Mask key — only return last 4 chars so the UI can show it without exposing the full key
        resend_api_key_masked:       row?.resend_api_key ? '••••' + row.resend_api_key.slice(-4) : '',
        resend_configured:           !!row?.resend_api_key,
      },
    };
  });

  // POST /api/settings/notifications/validate-resend
  // Validates a Resend API key and checks that the from_email domain is verified in that account
  fastify.post<{
    Body: { api_key: string; from_email: string };
  }>('/notifications/validate-resend', { preHandler: [requireAuth] }, async (request, reply) => {
    const { api_key, from_email } = request.body;

    if (!api_key || !from_email) {
      return reply.status(400).send({ success: false, error: 'api_key and from_email are required' });
    }

    const fromDomain = from_email.split('@')[1];
    if (!fromDomain) {
      return reply.status(400).send({ success: false, error: 'Invalid from_email format' });
    }

    // 1. Check API key is valid by listing domains
    let domainsRes: Response;
    try {
      domainsRes = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${api_key}` },
      });
    } catch {
      return reply.status(502).send({ success: false, error: 'Could not reach Resend API' });
    }

    if (domainsRes.status === 401 || domainsRes.status === 403) {
      return reply.status(400).send({ success: false, error: 'Invalid Resend API key' });
    }

    if (!domainsRes.ok) {
      return reply.status(502).send({ success: false, error: `Resend API returned ${domainsRes.status}` });
    }

    const domainsBody = await domainsRes.json() as { data: { name: string; status: string }[] };
    const domains = domainsBody.data ?? [];

    const matchedDomain = domains.find(d => d.name === fromDomain);

    if (!matchedDomain) {
      return {
        success: true,
        key_valid: true,
        domain_verified: false,
        message: `API key is valid but domain "${fromDomain}" is not added to this Resend account. Add and verify it in your Resend dashboard.`,
      };
    }

    if (matchedDomain.status !== 'verified') {
      return {
        success: true,
        key_valid: true,
        domain_verified: false,
        message: `Domain "${fromDomain}" is added but not yet verified (status: ${matchedDomain.status}). Complete DNS verification in your Resend dashboard.`,
      };
    }

    return {
      success: true,
      key_valid: true,
      domain_verified: true,
      message: `API key valid and domain "${fromDomain}" is verified. Ready to send.`,
    };
  });

  // PATCH /api/settings/notifications
  fastify.patch<{
    Body: {
      escalation_emails?: string[];
      escalation_wa_numbers?: string[];
      escalation_customer_message?: string;
      from_email?: string | null;
      resend_api_key?: string | null;
    };
  }>('/notifications', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getServerClient();
    const { escalation_emails, escalation_wa_numbers, escalation_customer_message, from_email, resend_api_key } = request.body;

    const { data, error } = await db
      .from('tenant_notification_settings')
      .upsert({
        tenant_id: request.tenantId,
        ...(escalation_emails !== undefined && { escalation_emails }),
        ...(escalation_wa_numbers !== undefined && { escalation_wa_numbers }),
        ...(escalation_customer_message !== undefined && { escalation_customer_message }),
        ...(from_email !== undefined && { from_email }),
        ...(resend_api_key !== undefined && { resend_api_key }),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' })
      .select('escalation_emails, escalation_wa_numbers, escalation_customer_message, from_email, resend_api_key')
      .single();

    if (error) return reply.status(500).send({ success: false, error: error.message });

    const row = data as { resend_api_key: string | null } & Record<string, unknown>;
    return {
      success: true,
      data: {
        ...row,
        resend_api_key_masked: row.resend_api_key ? '••••' + row.resend_api_key.slice(-4) : '',
        resend_configured: !!row.resend_api_key,
        resend_api_key: undefined,
      },
    };
  });
}
