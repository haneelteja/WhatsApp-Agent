import crypto from 'crypto';

const RAZORPAY_KEY_ID      = process.env['RAZORPAY_KEY_ID']      ?? '';
const RAZORPAY_KEY_SECRET  = process.env['RAZORPAY_KEY_SECRET']  ?? '';
const RAZORPAY_WEBHOOK_SECRET = process.env['RAZORPAY_WEBHOOK_SECRET'] ?? '';

const BASE_URL = 'https://api.razorpay.com/v1';

function basicAuth(): string {
  return 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
}

export interface CreatePaymentLinkParams {
  paymentId:    string;   // our payments.id — stored as payment_ref
  contactPhone: string;
  contactName:  string | null;
  amountPaise:  number;   // total * 100
  description?: string;
}

export interface RazorpayPaymentResult {
  success:    boolean;
  linkUrl:    string | null;
  paymentRef: string | null;  // Razorpay payment link ID
  error?:     string;
}

export async function createRazorpayPaymentLink(
  params: CreatePaymentLinkParams
): Promise<RazorpayPaymentResult> {
  const body = {
    amount:           params.amountPaise,
    currency:         'INR',
    description:      params.description ?? 'Order Payment — Elma Industries',
    customer: {
      name:    params.contactName ?? 'Customer',
      contact: params.contactPhone.startsWith('+') ? params.contactPhone : `+91${params.contactPhone.replace(/\D/g, '')}`,
    },
    notify: {
      sms:   true,
      email: false,
    },
    reminder_enable:  true,
    reference_id:     params.paymentId,  // our payment UUID for correlation
    expire_by:        Math.floor(Date.now() / 1000) + 86400 * 3,  // expires in 3 days
  };

  try {
    const response = await fetch(`${BASE_URL}/payment_links`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': basicAuth(),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as {
      id?:        string;
      short_url?: string;
      error?:     { description: string };
    };

    if (!response.ok || data.error) {
      return { success: false, linkUrl: null, paymentRef: null, error: data.error?.description ?? 'Razorpay error' };
    }

    return {
      success:    true,
      linkUrl:    data.short_url ?? null,
      paymentRef: data.id ?? null,
    };
  } catch (err) {
    return { success: false, linkUrl: null, paymentRef: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Webhook verification ─────────────────────────────────────────────────────
export function verifyRazorpayWebhook(rawBody: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return expected === signature;
}

// ─── Webhook event payload ────────────────────────────────────────────────────
export interface RazorpayWebhookEvent {
  event: string;
  payload: {
    payment_link?: {
      entity: {
        id:           string;
        reference_id: string;   // our payment UUID
        status:       string;   // 'paid' | 'cancelled' | 'expired'
        amount:       number;
        amount_paid:  number;
      };
    };
    payment?: {
      entity: {
        id:     string;
        status: string;
      };
    };
  };
}

export function parseRazorpayWebhook(body: unknown): RazorpayWebhookEvent | null {
  try {
    return body as RazorpayWebhookEvent;
  } catch {
    return null;
  }
}
