// Env vars are set via vitest.config.ts `test.env` — do not set them here.
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

import {
  verifyPhonePeWebhook,
  parsePhonePeWebhook,
} from '../../services/payment/phonepe.js';

// ── Helper ────────────────────────────────────────────────────────────────────

function buildChecksum(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

// ── verifyPhonePeWebhook ──────────────────────────────────────────────────────

describe('verifyPhonePeWebhook', () => {
  const secret = process.env['PHONEPE_WEBHOOK_SECRET']!;

  const sampleBody = JSON.stringify({
    event: 'checkout.order.completed',
    payload: {
      merchantOrderId: 'pay-uuid-001',
      state:           'COMPLETED',
      amount:          50000,
    },
  });

  it('returns true for a correctly signed webhook', () => {
    const sig = buildChecksum(sampleBody, secret);
    expect(verifyPhonePeWebhook(sampleBody, sig)).toBe(true);
  });

  it('returns false for a tampered signature', () => {
    expect(verifyPhonePeWebhook(sampleBody, 'deadbeef')).toBe(false);
  });

  it('returns false for an empty signature', () => {
    expect(verifyPhonePeWebhook(sampleBody, '')).toBe(false);
  });

  it('returns false when payload differs from signed content', () => {
    const sig      = buildChecksum(sampleBody, secret);
    const tampered = JSON.stringify({ event: 'checkout.order.failed', payload: { merchantOrderId: 'other', state: 'FAILED', amount: 0 } });
    expect(verifyPhonePeWebhook(tampered, sig)).toBe(false);
  });

  it('returns false when secret key is wrong', () => {
    const sig = buildChecksum(sampleBody, 'wrong_secret');
    expect(verifyPhonePeWebhook(sampleBody, sig)).toBe(false);
  });
});

// ── parsePhonePeWebhook ───────────────────────────────────────────────────────

describe('parsePhonePeWebhook', () => {
  it('parses a COMPLETED webhook correctly', () => {
    const body = {
      event: 'checkout.order.completed',
      payload: {
        merchantOrderId: 'pay-abc-123',
        state:           'COMPLETED',
        amount:          249900,
      },
    };

    const result = parsePhonePeWebhook(body);

    expect(result).not.toBeNull();
    expect(result?.merchantTransactionId).toBe('pay-abc-123');
    expect(result?.state).toBe('COMPLETED');
    expect(result?.amount).toBe(249900);
    expect(result?.event).toBe('checkout.order.completed');
  });

  it('parses a FAILED webhook correctly', () => {
    const body = {
      event: 'checkout.order.failed',
      payload: {
        merchantOrderId: 'pay-fail-001',
        state:           'FAILED',
        amount:          50000,
      },
    };

    const result = parsePhonePeWebhook(body);
    expect(result?.state).toBe('FAILED');
    expect(result?.merchantTransactionId).toBe('pay-fail-001');
  });

  it('returns null when merchantOrderId is missing', () => {
    const body = { event: 'checkout.order.completed', payload: { state: 'COMPLETED', amount: 100 } };
    expect(parsePhonePeWebhook(body)).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parsePhonePeWebhook(null)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parsePhonePeWebhook('raw string')).toBeNull();
  });
});
