import crypto from 'crypto';

const PHONEPE_SALT_KEY   = process.env['PHONEPE_SALT_KEY']   ?? '';
const PHONEPE_SALT_INDEX = process.env['PHONEPE_SALT_INDEX'] ?? '1';
const PHONEPE_MERCHANT_ID = process.env['PHONEPE_MERCHANT_ID'] ?? '';
const IS_SANDBOX = process.env['PHONEPE_ENV'] !== 'production';

const BASE_URL = IS_SANDBOX
  ? 'https://api-preprod.phonepe.com/apis/pg-sandbox'
  : 'https://api.phonepe.com/apis/hermes';

const API_BASE_URL = process.env['API_BASE_URL'] ?? 'https://your-api.onrender.com';
const WEB_BASE_URL = process.env['WEB_BASE_URL'] ?? 'https://your-app.vercel.app';

export interface CreatePaymentLinkParams {
  paymentId:   string;   // our payments.id — used as merchantTransactionId
  contactId:   string;
  contactPhone: string;
  amountPaise: number;   // amount in paise (total * 100)
  orderId:     string;
  description?: string;
}

export interface PhonePePaymentResult {
  success:     boolean;
  redirectUrl: string | null;
  phonePeRef:  string | null;
  error?:      string;
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function buildXVerify(base64Payload: string, endpoint: string): string {
  const hash = sha256(base64Payload + endpoint + PHONEPE_SALT_KEY);
  return `${hash}###${PHONEPE_SALT_INDEX}`;
}

export async function createPhonePePaymentLink(
  params: CreatePaymentLinkParams
): Promise<PhonePePaymentResult> {
  const endpoint = '/pg/v1/pay';

  const payload = {
    merchantId:            PHONEPE_MERCHANT_ID,
    merchantTransactionId: params.paymentId,
    merchantUserId:        params.contactId,
    amount:                params.amountPaise,
    redirectUrl:           `${WEB_BASE_URL}/payment/status/${params.paymentId}`,
    redirectMode:          'REDIRECT',
    callbackUrl:           `${API_BASE_URL}/api/payments/phonepe/webhook`,
    mobileNumber:          params.contactPhone.replace(/\D/g, '').replace(/^91/, ''),
    paymentInstrument:     { type: 'PAY_PAGE' },
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const xVerify = buildXVerify(base64Payload, endpoint);

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-VERIFY':      xVerify,
        'X-MERCHANT-ID': PHONEPE_MERCHANT_ID,
      },
      body: JSON.stringify({ request: base64Payload }),
    });

    const data = await response.json() as {
      success: boolean;
      code:    string;
      message: string;
      data?: {
        merchantId:            string;
        merchantTransactionId: string;
        instrumentResponse?: {
          redirectInfo?: { url: string };
        };
      };
    };

    if (!data.success) {
      return { success: false, redirectUrl: null, phonePeRef: null, error: `${data.code}: ${data.message}` };
    }

    const redirectUrl = data.data?.instrumentResponse?.redirectInfo?.url ?? null;
    return {
      success:     true,
      redirectUrl,
      phonePeRef:  params.paymentId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, redirectUrl: null, phonePeRef: null, error: msg };
  }
}

export interface PhonePeWebhookPayload {
  response: string; // base64-encoded JSON
}

export interface PhonePeWebhookData {
  merchantTransactionId: string;
  transactionId:         string;
  amount:                number;
  state:                 'COMPLETED' | 'FAILED' | 'PENDING';
  responseCode:          string;
}

export function verifyPhonePeWebhook(
  base64Response: string,
  xVerify:        string,
): boolean {
  const [hash, saltIndex] = xVerify.split('###');
  if (saltIndex !== PHONEPE_SALT_INDEX) return false;
  const expected = sha256(base64Response + PHONEPE_SALT_KEY);
  return hash === expected;
}

export function parsePhonePeWebhook(base64Response: string): PhonePeWebhookData | null {
  try {
    const decoded = Buffer.from(base64Response, 'base64').toString('utf-8');
    const parsed  = JSON.parse(decoded) as { data: PhonePeWebhookData };
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export async function checkPhonePeStatus(merchantTransactionId: string): Promise<'COMPLETED' | 'FAILED' | 'PENDING'> {
  const endpoint = `/pg/v1/status/${PHONEPE_MERCHANT_ID}/${merchantTransactionId}`;
  const xVerify  = buildXVerify('', endpoint);

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        'X-VERIFY':      xVerify,
        'X-MERCHANT-ID': PHONEPE_MERCHANT_ID,
      },
    });
    const data = await response.json() as { data?: { state: 'COMPLETED' | 'FAILED' | 'PENDING' } };
    return data.data?.state ?? 'PENDING';
  } catch {
    return 'PENDING';
  }
}
