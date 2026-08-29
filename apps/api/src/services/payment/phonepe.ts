import crypto from 'crypto';

// New PhonePe PG API — OAuth2 token auth (replaces old Salt Key + X-VERIFY)
const CLIENT_ID      = process.env['PHONEPE_CLIENT_ID']      ?? '';
const CLIENT_VERSION = process.env['PHONEPE_CLIENT_VERSION'] ?? '1';
const CLIENT_SECRET  = process.env['PHONEPE_CLIENT_SECRET']  ?? '';
const WEBHOOK_SECRET = process.env['PHONEPE_WEBHOOK_SECRET'] ?? '';
const IS_SANDBOX     = process.env['PHONEPE_ENV'] !== 'production';

const AUTH_URL = IS_SANDBOX
  ? 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token'
  : 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token';

const PAY_URL = IS_SANDBOX
  ? 'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay'
  : 'https://api.phonepe.com/apis/pg/checkout/v2/pay';

const WEB_BASE_URL = process.env['WEB_BASE_URL'] ?? 'https://your-app.vercel.app';

// ─── Token cache (module-level, refreshed 60s before expiry) ──────────────────

let _cachedToken: string | null = null;
let _tokenExpiresAt = 0; // epoch seconds

async function getAuthToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_cachedToken && _tokenExpiresAt - 60 > now) return _cachedToken;

  const params = new URLSearchParams({
    client_id:      CLIENT_ID,
    client_version: CLIENT_VERSION,
    client_secret:  CLIENT_SECRET,
    grant_type:     'client_credentials',
  });

  const res = await fetch(AUTH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PhonePe auth ${res.status}: ${text}`);
  }

  const data = await res.json() as { access_token: string; expires_at: number };
  _cachedToken    = data.access_token;
  _tokenExpiresAt = data.expires_at;
  return _cachedToken;
}

// ─── Create payment ────────────────────────────────────────────────────────────

export interface CreatePaymentLinkParams {
  paymentId:    string;   // our payments.id — used as merchantOrderId
  contactId:    string;
  contactPhone: string;
  amountPaise:  number;   // amount in paise (₹10 = 1000)
  orderId:      string;
  description?: string;
}

export interface PhonePePaymentResult {
  success:     boolean;
  redirectUrl: string | null;
  phonePeRef:  string | null;
  error?:      string;
}

export async function createPhonePePaymentLink(
  params: CreatePaymentLinkParams
): Promise<PhonePePaymentResult> {
  try {
    const token = await getAuthToken();

    const body = {
      merchantOrderId: params.paymentId, // UUID is 36 chars, within 63-char limit
      amount:          params.amountPaise,
      expireAfter:     1800,             // 30 minutes
      paymentFlow: {
        type: 'PG_CHECKOUT',
        merchantUrls: {
          redirectUrl: `${WEB_BASE_URL}/payment/status/${params.paymentId}`,
        },
      },
      prefillUserLoginDetails: {
        phoneNumber: params.contactPhone.replace(/\D/g, '').replace(/^91/, ''),
      },
      metaInfo: {
        udf1: params.orderId,
        udf2: params.contactId,
        udf3: params.description ?? '',
      },
    };

    const res = await fetch(PAY_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `O-Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as {
      orderId?:     string;
      state?:       string;
      redirectUrl?: string;
      code?:        string;
      message?:     string;
    };

    if (!res.ok || !data.redirectUrl) {
      return { success: false, redirectUrl: null, phonePeRef: null, error: `${data.code ?? res.status}: ${data.message ?? 'No redirect URL'}` };
    }

    return { success: true, redirectUrl: data.redirectUrl, phonePeRef: params.paymentId };
  } catch (err) {
    return { success: false, redirectUrl: null, phonePeRef: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Webhook verification & parsing ───────────────────────────────────────────

export interface PhonePeWebhookData {
  event:                 string;  // checkout.order.completed | checkout.order.failed
  merchantTransactionId: string;  // = payload.merchantOrderId = our payments.id
  state:                 'COMPLETED' | 'FAILED' | 'PENDING';
  amount:                number;
}

// rawBody should be the exact string received from PhonePe (before JSON parsing)
export function verifyPhonePeWebhook(rawBody: string, checksumSignature: string): boolean {
  if (!WEBHOOK_SECRET || !rawBody || !checksumSignature) return false;
  try {
    const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(checksumSignature));
  } catch {
    return false;
  }
}

export function parsePhonePeWebhook(body: unknown): PhonePeWebhookData | null {
  try {
    const b = body as {
      event?:   string;
      payload?: {
        merchantOrderId?: string;
        state?:           string;
        amount?:          number;
      };
    };

    const event                = b.event ?? '';
    const merchantTransactionId = b.payload?.merchantOrderId ?? '';
    const state                = (b.payload?.state ?? 'PENDING') as PhonePeWebhookData['state'];
    const amount               = b.payload?.amount ?? 0;

    if (!merchantTransactionId) return null;
    return { event, merchantTransactionId, state, amount };
  } catch {
    return null;
  }
}

// ─── Order status check ────────────────────────────────────────────────────────

export async function checkPhonePeStatus(merchantOrderId: string): Promise<'COMPLETED' | 'FAILED' | 'PENDING'> {
  const statusUrl = IS_SANDBOX
    ? `https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/order/${merchantOrderId}/status`
    : `https://api.phonepe.com/apis/pg/checkout/v2/order/${merchantOrderId}/status`;

  try {
    const token = await getAuthToken();
    const res   = await fetch(statusUrl, {
      headers: { 'Authorization': `O-Bearer ${token}` },
    });
    const data = await res.json() as { state?: string };
    if (data.state === 'COMPLETED') return 'COMPLETED';
    if (data.state === 'FAILED')    return 'FAILED';
    return 'PENDING';
  } catch {
    return 'PENDING';
  }
}
