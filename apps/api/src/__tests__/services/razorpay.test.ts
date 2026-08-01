// Env vars are set via vitest.config.ts `test.env` — do not set them here.
// ESM imports are hoisted, so top-level process.env assignments in test files
// run AFTER module-level constants have already been evaluated.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

import {
  verifyRazorpayWebhook,
  parseRazorpayWebhook,
  createRazorpayPaymentLink,
  type RazorpayWebhookEvent,
} from '../../services/payment/razorpay.js';

// ── Helper ────────────────────────────────────────────────────────────────────

function hmac(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// ── verifyRazorpayWebhook ─────────────────────────────────────────────────────

describe('verifyRazorpayWebhook', () => {
  const secret  = process.env['RAZORPAY_WEBHOOK_SECRET']!;
  const payload = JSON.stringify({ event: 'payment_link.paid', payload: {} });

  it('returns true for a correctly signed webhook', () => {
    const sig = hmac(payload, secret);
    expect(verifyRazorpayWebhook(payload, sig)).toBe(true);
  });

  it('returns false for a tampered signature', () => {
    expect(verifyRazorpayWebhook(payload, 'deadbeef')).toBe(false);
  });

  it('returns false when payload is different from what was signed', () => {
    const sig = hmac(payload, secret);
    expect(verifyRazorpayWebhook('{"tampered":true}', sig)).toBe(false);
  });

  it('returns false for an empty signature', () => {
    expect(verifyRazorpayWebhook(payload, '')).toBe(false);
  });

  it('is case-sensitive — uppercase hex fails', () => {
    const sig = hmac(payload, secret).toUpperCase();
    expect(verifyRazorpayWebhook(payload, sig)).toBe(false);
  });
});

// ── parseRazorpayWebhook ──────────────────────────────────────────────────────

describe('parseRazorpayWebhook', () => {
  it('parses a payment_link.paid event correctly', () => {
    const event: RazorpayWebhookEvent = {
      event: 'payment_link.paid',
      payload: {
        payment_link: {
          entity: {
            id:           'plink_123',
            reference_id: 'pay-uuid-abc',
            status:       'paid',
            amount:       249900,
            amount_paid:  249900,
          },
        },
      },
    };

    const result = parseRazorpayWebhook(event);
    expect(result).not.toBeNull();
    expect(result?.event).toBe('payment_link.paid');
    expect(result?.payload.payment_link?.entity.reference_id).toBe('pay-uuid-abc');
  });

  it('returns null for null input', () => {
    expect(parseRazorpayWebhook(null)).toBeNull();
  });

  it('handles payment_link.expired event', () => {
    const event = {
      event:   'payment_link.expired',
      payload: { payment_link: { entity: { id: 'p1', reference_id: 'ref1', status: 'expired', amount: 100, amount_paid: 0 } } },
    };
    const result = parseRazorpayWebhook(event);
    expect(result?.event).toBe('payment_link.expired');
  });
});

// ── createRazorpayPaymentLink ─────────────────────────────────────────────────

describe('createRazorpayPaymentLink', () => {
  const originalFetch = global.fetch;

  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => { global.fetch = originalFetch; });

  const baseParams = {
    paymentId:    'pay-uuid-001',
    contactPhone: '+919876543210',
    contactName:  'Test Customer',
    amountPaise:  50000,
    description:  'Order #001',
  };

  it('returns success with linkUrl on a 200 response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'plink_abc', short_url: 'https://rzp.io/l/abc' }), { status: 200 }),
    );

    const result = await createRazorpayPaymentLink(baseParams);

    expect(result.success).toBe(true);
    expect(result.linkUrl).toBe('https://rzp.io/l/abc');
    expect(result.paymentRef).toBe('plink_abc');
  });

  it('prepends +91 to bare Indian numbers', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'p1', short_url: 'https://rzp.io/l/x' }), { status: 200 }),
    );

    await createRazorpayPaymentLink({ ...baseParams, contactPhone: '9876543210' });

    const [, options] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.customer.contact).toBe('+919876543210');
  });

  it('returns failure with error description on non-200', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { description: 'Bad request' } }), { status: 400 }),
    );

    const result = await createRazorpayPaymentLink(baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Bad request');
    expect(result.linkUrl).toBeNull();
  });

  it('returns failure when fetch throws a network error', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await createRazorpayPaymentLink(baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('sets a 3-day expiry on the payment link', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'p1', short_url: 'https://rzp.io/l/x' }), { status: 200 }),
    );

    const before = Math.floor(Date.now() / 1000);
    await createRazorpayPaymentLink(baseParams);
    const after = Math.floor(Date.now() / 1000);

    const [, options] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const { expire_by } = JSON.parse(options.body as string) as { expire_by: number };

    expect(expire_by).toBeGreaterThanOrEqual(before + 86400 * 3 - 2);
    expect(expire_by).toBeLessThanOrEqual(after  + 86400 * 3 + 2);
  });

  it('sets reference_id to the provided paymentId for webhook correlation', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'p1', short_url: 'https://rzp.io/l/x' }), { status: 200 }),
    );

    await createRazorpayPaymentLink(baseParams);

    const [, options] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.reference_id).toBe('pay-uuid-001');
  });
});
