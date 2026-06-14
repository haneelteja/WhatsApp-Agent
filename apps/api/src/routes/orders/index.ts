import type { FastifyInstance } from 'fastify';
import { getServerClient } from '@alphabot/database';
import {
  createRazorpayPaymentLink,
  verifyRazorpayWebhook,
  parseRazorpayWebhook,
} from '../../services/payment/razorpay.js';
import { WhatsAppGateway } from '../../services/whatsapp/gateway.js';
import type { WhatsAppProvider } from '@alphabot/shared';

export async function orderRoutes(fastify: FastifyInstance): Promise<void> {
  const db = getServerClient();

  // ─── POST /api/orders — create order + generate Razorpay payment link ────
  fastify.post<{ Body: {
    tenantId:       string;
    contactId:      string;
    conversationId: string;
    items:          Array<{ name: string; quantity: number; price: number; sku?: string }>;
    total:          number;
    sendLink?:      boolean;
  } }>('/', async (request, reply) => {
    const { tenantId, contactId, conversationId, items, total, sendLink = true } = request.body;

    if (!tenantId || !contactId || !conversationId || !items?.length || !total) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    // Create order
    const { data: order, error: orderError } = await db
      .from('orders')
      .insert({ tenant_id: tenantId, contact_id: contactId, conversation_id: conversationId, items_json: items, total, status: 'pending' })
      .select()
      .single();

    if (orderError || !order) {
      fastify.log.error({ orderError }, '[Orders] Failed to create order');
      return reply.status(500).send({ error: 'Failed to create order' });
    }

    // Create pending payment row
    const { data: payment, error: paymentError } = await db
      .from('payments')
      .insert({ order_id: order.id, status: 'pending' })
      .select()
      .single();

    if (paymentError || !payment) {
      fastify.log.error({ paymentError }, '[Orders] Failed to create payment record');
      return reply.status(500).send({ error: 'Failed to create payment record' });
    }

    // Fetch contact
    const { data: contact } = await db
      .from('contacts')
      .select('phone, name')
      .eq('id', contactId)
      .single();

    if (!contact?.phone) {
      return reply.status(201).send({ order, payment, linkUrl: null });
    }

    // Generate Razorpay payment link
    const result = await createRazorpayPaymentLink({
      paymentId:    payment.id,
      contactPhone: contact.phone,
      contactName:  contact.name ?? null,
      amountPaise:  Math.round(total * 100),
      description:  `Order #${order.id.slice(0, 8)} — Elma Industries`,
    });

    if (result.success && result.linkUrl) {
      await db.from('payments')
        .update({ payment_ref: result.paymentRef, link_url: result.linkUrl })
        .eq('id', payment.id);

      // Send link via WhatsApp
      if (sendLink) {
        const { data: wn } = await db
          .from('whatsapp_numbers')
          .select('config_json, provider')
          .eq('tenant_id', tenantId)
          .eq('product_slug', 'lifecycle_bot')
          .eq('active', true)
          .maybeSingle();

        if (wn) {
          const config  = wn.config_json as { phone_number_id: string; access_token: string };
          const gateway = new WhatsAppGateway(wn.provider as WhatsAppProvider);
          const itemsSummary = items.map(i => `${i.name} ×${i.quantity}`).join(', ');

          await gateway.sendMessage(config.phone_number_id, config.access_token, {
            type: 'text',
            to:   contact.phone,
            text: `🧾 *Order Confirmed!*\n\nItems: ${itemsSummary}\nTotal: ₹${total.toFixed(2)}\n\n💳 Pay securely:\n${result.linkUrl}`,
          });
        }
      }

      return reply.status(201).send({ order, payment: { ...payment, link_url: result.linkUrl }, linkUrl: result.linkUrl });
    }

    fastify.log.warn({ error: result.error }, '[Orders] Razorpay link generation failed');
    return reply.status(201).send({ order, payment, linkUrl: null, razorpayError: result.error });
  });

  // ─── GET /api/orders — list orders for a tenant ──────────────────────────
  fastify.get<{ Querystring: { tenantId: string; limit?: string; offset?: string } }>('/', async (request, reply) => {
    const { tenantId, limit = '50', offset = '0' } = request.query;
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });

    const { data: orders, error } = await db
      .from('orders')
      .select(`*, contact:contacts(phone, name), payments(id, status, link_url, payment_ref, created_at)`)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ orders: orders ?? [] });
  });

  // ─── GET /api/orders/:id ──────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { data: order, error } = await db
      .from('orders')
      .select(`*, contact:contacts(phone, name), payments(*)`)
      .eq('id', request.params.id)
      .single();

    if (error || !order) return reply.status(404).send({ error: 'Order not found' });
    return reply.send({ order });
  });

  // ─── PATCH /api/orders/:id/status ────────────────────────────────────────
  fastify.patch<{ Params: { id: string }; Body: { status: string } }>('/:id/status', async (request, reply) => {
    const valid = ['pending', 'confirmed', 'dispatched', 'delivered', 'cancelled'];
    if (!valid.includes(request.body.status)) return reply.status(400).send({ error: 'Invalid status' });

    const { data, error } = await db
      .from('orders')
      .update({ status: request.body.status, updated_at: new Date().toISOString() })
      .eq('id', request.params.id)
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ order: data });
  });

  // ─── POST /api/orders/:id/resend-link ────────────────────────────────────
  fastify.post<{ Params: { id: string } }>('/:id/resend-link', async (request, reply) => {
    const { data: order } = await db
      .from('orders')
      .select(`tenant_id, total, contact:contacts(phone), payments(link_url, status)`)
      .eq('id', request.params.id)
      .single();

    if (!order) return reply.status(404).send({ error: 'Order not found' });

    const payment = (order as unknown as { payments: Array<{ link_url: string | null; status: string }> }).payments?.[0];
    const contact = (order as unknown as { contact: { phone: string } }).contact;

    if (!payment?.link_url || !contact?.phone) {
      return reply.status(400).send({ error: 'No payment link available' });
    }

    const { data: wn } = await db
      .from('whatsapp_numbers')
      .select('config_json, provider')
      .eq('tenant_id', (order as { tenant_id: string }).tenant_id)
      .eq('product_slug', 'lifecycle_bot')
      .eq('active', true)
      .maybeSingle();

    if (wn) {
      const config  = wn.config_json as { phone_number_id: string; access_token: string };
      const gateway = new WhatsAppGateway(wn.provider as WhatsAppProvider);
      await gateway.sendMessage(config.phone_number_id, config.access_token, {
        type: 'text',
        to:   contact.phone,
        text: `🔔 *Payment Reminder*\n\nYour payment of ₹${(order as { total: number }).total.toFixed(2)} is pending:\n\n${payment.link_url}`,
      });
    }

    return reply.send({ sent: true });
  });
}

// ─── Razorpay webhook ─────────────────────────────────────────────────────────
export async function razorpayWebhookRoute(fastify: FastifyInstance): Promise<void> {
  const db = getServerClient();

  fastify.post('/razorpay/webhook', {
    config: { rawBody: true },
  }, async (request, reply) => {
    reply.status(200).send('');

    const signature = request.headers['x-razorpay-signature'] as string ?? '';
    const rawBody   = (request as { rawBody?: string }).rawBody ?? JSON.stringify(request.body);

    if (!verifyRazorpayWebhook(rawBody, signature)) {
      fastify.log.warn('[Razorpay Webhook] Signature verification failed');
      return;
    }

    const event = parseRazorpayWebhook(request.body);
    if (!event) return;

    fastify.log.info({ event: event.event }, '[Razorpay Webhook] received');

    // Handle payment_link.paid event
    if (event.event === 'payment_link.paid') {
      const linkEntity = event.payload.payment_link?.entity;
      if (!linkEntity) return;

      // reference_id is our payment UUID
      const paymentId = linkEntity.reference_id;
      if (!paymentId) return;

      const { data: payment } = await db
        .from('payments')
        .update({ status: 'paid', webhook_received_at: new Date().toISOString() })
        .eq('id', paymentId)
        .select('order_id')
        .single();

      if (!payment) return;

      await db.from('orders')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', payment.order_id);

      // Notify customer
      const { data: order } = await db
        .from('orders')
        .select(`tenant_id, total, contact:contacts(phone)`)
        .eq('id', payment.order_id)
        .single();

      if (order) {
        const tenantId = (order as unknown as { tenant_id: string }).tenant_id;
        const contact  = (order as unknown as { contact: { phone: string } }).contact;

        const { data: wn } = await db
          .from('whatsapp_numbers')
          .select('config_json, provider')
          .eq('tenant_id', tenantId)
          .eq('product_slug', 'lifecycle_bot')
          .eq('active', true)
          .maybeSingle();

        if (wn && contact?.phone) {
          const config  = wn.config_json as { phone_number_id: string; access_token: string };
          const gateway = new WhatsAppGateway(wn.provider as WhatsAppProvider);
          await gateway.sendMessage(config.phone_number_id, config.access_token, {
            type: 'text',
            to:   contact.phone,
            text: `✅ *Payment Received!*\n\nThank you! Your payment of ₹${(order as { total: number }).total.toFixed(2)} is confirmed.\n\nYour order is being processed. We'll keep you updated! 🎉`,
          });
        }
      }
    }

    // Handle payment_link.expired or payment_link.cancelled
    if (event.event === 'payment_link.expired' || event.event === 'payment_link.cancelled') {
      const linkEntity = event.payload.payment_link?.entity;
      if (!linkEntity?.reference_id) return;

      await db.from('payments')
        .update({ status: 'expired', webhook_received_at: new Date().toISOString() })
        .eq('id', linkEntity.reference_id);
    }
  });
}
