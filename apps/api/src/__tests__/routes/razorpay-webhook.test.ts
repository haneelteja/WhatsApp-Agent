// Env vars are set via vitest.config.ts `test.env`.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import Fastify from 'fastify';

// ── DB mock ───────────────────────────────────────────────────────────────────
// We resolve a Promise when the payments table is touched, so tests don't rely
// on arbitrary setTimeout delays.

let resolvePaymentsTouched: (() => void) | null = null;
let paymentsTouchedPromise: Promise<void>       = Promise.resolve();

function resetPaymentSignal() {
  paymentsTouchedPromise = new Promise<void>(r => { resolvePaymentsTouched = r; });
}

const mockUpdate = vi.fn();
const mockEq     = vi.fn(() => ({
  select: vi.fn(() => ({
    single: vi.fn(() => Promise.resolve({ data: { order_id: 'order-001' }, error: null })),
  })),
}));
const mockFrom = vi.fn((table: string) => {
  if (table === 'payments') resolvePaymentsTouched?.();
  return { update: mockUpdate.mockReturnValue({ eq: mockEq }) };
});

vi.mock('@alphabot/database', () => ({
  getServerClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('../../services/whatsapp/gateway.js', () => ({
  WhatsAppGateway: vi.fn().mockImplementation(() => ({
    sendMessage: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { razorpayWebhookRoute } from '../../routes/orders/index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function webhookSig(body: string): string {
  return crypto
    .createHmac('sha256', process.env['RAZORPAY_WEBHOOK_SECRET']!)
    .update(body)
    .digest('hex');
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(razorpayWebhookRoute, { prefix: '/api/payments' });
  await app.ready();
  return app;
}

const PAID_BODY = JSON.stringify({
  event: 'payment_link.paid',
  payload: {
    payment_link: {
      entity: {
        id:           'plink_test',
        reference_id: 'pay-uuid-001',
        status:       'paid',
        amount:       249900,
        amount_paid:  249900,
      },
    },
  },
});

const EXPIRED_BODY = JSON.stringify({
  event: 'payment_link.expired',
  payload: {
    payment_link: {
      entity: {
        id:           'plink_expired',
        reference_id: 'pay-uuid-002',
        status:       'expired',
        amount:       249900,
        amount_paid:  0,
      },
    },
  },
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Razorpay webhook route', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    mockFrom.mockClear();
    mockUpdate.mockClear();
    mockEq.mockClear();
    resetPaymentSignal();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('always responds 200 immediately (Razorpay requires a fast ACK)', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/payments/razorpay/webhook',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'bad-sig' },
      payload: PAID_BODY,
    });
    expect(res.statusCode).toBe(200);
  });

  it('does not touch the DB when signature is invalid', async () => {
    await app.inject({
      method:  'POST',
      url:     '/api/payments/razorpay/webhook',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'bad-sig' },
      payload: PAID_BODY,
    });

    // Give the async post-response handler a tick to run (it won't since sig failed)
    await new Promise(r => setImmediate(r));
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('marks payment as paid on payment_link.paid with valid signature', async () => {
    const sig = webhookSig(PAID_BODY);

    await app.inject({
      method:  'POST',
      url:     '/api/payments/razorpay/webhook',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig },
      payload: PAID_BODY,
    });

    // Wait until the payments table is touched (or 500ms timeout)
    await Promise.race([
      paymentsTouchedPromise,
      new Promise<void>(r => setTimeout(r, 500)),
    ]);

    expect(mockFrom).toHaveBeenCalledWith('payments');
    const updateArg = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateArg?.status).toBe('paid');
  });

  it('marks payment as expired on payment_link.expired with valid signature', async () => {
    const sig = webhookSig(EXPIRED_BODY);

    await app.inject({
      method:  'POST',
      url:     '/api/payments/razorpay/webhook',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig },
      payload: EXPIRED_BODY,
    });

    await Promise.race([
      paymentsTouchedPromise,
      new Promise<void>(r => setTimeout(r, 500)),
    ]);

    expect(mockFrom).toHaveBeenCalledWith('payments');
    const updateArg = mockUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateArg?.status).toBe('expired');
  });

  it('returns 200 and makes no DB calls for unrecognised event types', async () => {
    const body = JSON.stringify({ event: 'unknown.event', payload: {} });
    const sig  = webhookSig(body);

    const res = await app.inject({
      method:  'POST',
      url:     '/api/payments/razorpay/webhook',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    await new Promise(r => setImmediate(r));
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
