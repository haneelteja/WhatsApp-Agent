// Outbound webhook delivery service.
//
// Fires signed HTTP POST requests to a tenant's configured external endpoint
// whenever a key event occurs (contact created, conversation resolved, etc.).
// The external system verifies the signature using x-alphabot-signature.

import { createHmac } from 'crypto';
import { getServerClient } from '@alphabot/database';

// Minimal duck-type so both pino.Logger and FastifyBaseLogger satisfy it
type MinLogger = { error(obj: unknown, msg?: string): void };

type OutboundEvent =
  | 'contact.created'
  | 'contact.updated'
  | 'conversation.resolved'
  | 'conversation.escalated'
  | 'data.export';

export async function fireOutboundWebhook(
  tenantId:  string,
  eventType: OutboundEvent,
  payload:   Record<string, unknown>,
  log?:      MinLogger,
): Promise<void> {
  const db = getServerClient();

  // Fetch integration settings
  const { data: integration } = await db
    .from('tenant_integrations')
    .select('outbound_webhook_url, outbound_signing_secret, outbound_events, enabled')
    .eq('tenant_id', tenantId)
    .single();

  if (!integration || !integration.enabled) return;

  const url     = integration.outbound_webhook_url as string | null;
  const secret  = integration.outbound_signing_secret as string;
  const events  = (integration.outbound_events as string[] | null) ?? [];

  // Not configured, or this event isn't subscribed
  if (!url || !events.includes(eventType)) {
    return;
  }

  const body = JSON.stringify({
    event:      eventType,
    timestamp:  new Date().toISOString(),
    tenant_id:  tenantId,
    data:       payload,
  });

  // HMAC-SHA256 sign the raw body — external system verifies this
  const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

  let httpStatus: number | undefined;
  let errorMessage: string | undefined;
  let status: 'delivered' | 'failed' = 'delivered';

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'content-type':         'application/json',
        'x-alphabot-signature': signature,
        'x-alphabot-event':     eventType,
        'x-alphabot-timestamp': new Date().toISOString(),
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    httpStatus = res.status;
    if (!res.ok) {
      status = 'failed';
      errorMessage = `HTTP ${res.status}`;
    }
  } catch (err) {
    status = 'failed';
    errorMessage = err instanceof Error ? err.message : String(err);
    log?.error({ err, tenantId, eventType, url }, '[Outbound] Webhook delivery failed');
  }

  // Log the delivery attempt
  await db.from('outbound_logs').insert({
    tenant_id:     tenantId,
    event_type:    eventType,
    status,
    http_status:   httpStatus ?? null,
    error_message: errorMessage ?? null,
  });
}
