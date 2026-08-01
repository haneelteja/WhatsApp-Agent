// Env vars are set via vitest.config.ts `test.env` — do not set them here.
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

import {
  verifyPhonePeWebhook,
  parsePhonePeWebhook,
} from '../../services/payment/phonepe.js';

// ── Helper ────────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function buildXVerify(base64Response: string, saltKey: string, saltIndex: string): string {
  const hash = sha256(base64Response + saltKey);
  return `${hash}###${saltIndex}`;
}

// ── verifyPhonePeWebhook ──────────────────────────────────────────────────────

describe('verifyPhonePeWebhook', () => {
  const saltKey   = process.env['PHONEPE_SALT_KEY']!;
  const saltIndex = process.env['PHONEPE_SALT_INDEX']!;

  const sampleResponse = Buffer.from(JSON.stringify({
    data: {
      merchantTransactionId: 'pay-uuid-001',
      transactionId:         'T1234567890',
      amount:                50000,
      state:                 'COMPLETED',
      responseCode:          'SUCCESS',
    },
  })).toString('base64');

  it('returns true for a correctly signed webhook', () => {
    const xVerify = buildXVerify(sampleResponse, saltKey, saltIndex);
    expect(verifyPhonePeWebhook(sampleResponse, xVerify)).toBe(true);
  });

  it('returns false for a tampered X-VERIFY hash', () => {
    const xVerify = `deadbeef###${saltIndex}`;
    expect(verifyPhonePeWebhook(sampleResponse, xVerify)).toBe(false);
  });

  it('returns false when salt index does not match', () => {
    const hash    = sha256(sampleResponse + saltKey);
    const xVerify = `${hash}###2`; // wrong index
    expect(verifyPhonePeWebhook(sampleResponse, xVerify)).toBe(false);
  });

  it('returns false for an empty X-VERIFY string', () => {
    expect(verifyPhonePeWebhook(sampleResponse, '')).toBe(false);
  });

  it('returns false when payload differs from signed content', () => {
    const xVerify  = buildXVerify(sampleResponse, saltKey, saltIndex);
    const tampered = Buffer.from('{"tampered":true}').toString('base64');
    expect(verifyPhonePeWebhook(tampered, xVerify)).toBe(false);
  });

  it('returns false when salt key is wrong', () => {
    const xVerify = buildXVerify(sampleResponse, 'wrong_salt_key', saltIndex);
    expect(verifyPhonePeWebhook(sampleResponse, xVerify)).toBe(false);
  });
});

// ── parsePhonePeWebhook ───────────────────────────────────────────────────────

describe('parsePhonePeWebhook', () => {
  function encode(data: unknown): string {
    return Buffer.from(JSON.stringify({ data })).toString('base64');
  }

  it('parses a COMPLETED webhook correctly', () => {
    const payload = {
      merchantTransactionId: 'pay-abc-123',
      transactionId:         'T9876543210',
      amount:                249900,
      state:                 'COMPLETED' as const,
      responseCode:          'SUCCESS',
    };

    const result = parsePhonePeWebhook(encode(payload));

    expect(result).not.toBeNull();
    expect(result?.merchantTransactionId).toBe('pay-abc-123');
    expect(result?.state).toBe('COMPLETED');
    expect(result?.amount).toBe(249900);
  });

  it('parses a FAILED webhook correctly', () => {
    const payload = {
      merchantTransactionId: 'pay-fail-001',
      transactionId:         'T000',
      amount:                50000,
      state:                 'FAILED' as const,
      responseCode:          'PAYMENT_ERROR',
    };

    const result = parsePhonePeWebhook(encode(payload));
    expect(result?.state).toBe('FAILED');
    expect(result?.responseCode).toBe('PAYMENT_ERROR');
  });

  it('returns null for invalid base64', () => {
    expect(parsePhonePeWebhook('!!!not-valid-base64!!!')).toBeNull();
  });

  it('returns null for base64 that is not valid JSON', () => {
    const notJson = Buffer.from('not json at all').toString('base64');
    expect(parsePhonePeWebhook(notJson)).toBeNull();
  });

  it('returns null when the data field is missing', () => {
    const noData = Buffer.from(JSON.stringify({ other: 'field' })).toString('base64');
    expect(parsePhonePeWebhook(noData)).toBeNull();
  });
});
