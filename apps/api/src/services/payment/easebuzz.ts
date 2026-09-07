import crypto from 'crypto';

const KEY        = process.env['EASEBUZZ_MERCHANT_KEY'] ?? '';
const SALT       = process.env['EASEBUZZ_SALT']          ?? '';
const ENV        = process.env['EASEBUZZ_ENV']            ?? 'test';
const SURL       = process.env['EASEBUZZ_SURL']           ?? '';

const PAY_BASE   = ENV === 'prod' ? 'https://pay.easebuzz.in/'       : 'https://testpay.easebuzz.in/';
const DASH_BASE  = ENV === 'prod' ? 'https://dashboard.easebuzz.in/' : 'https://testdashboard.easebuzz.in/';

function sha512hex(str: string): string {
  return crypto.createHash('sha512').update(str).digest('hex');
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits.slice(2);
  return digits.slice(-10);
}

function buildInitiateHash(
  key: string, txnid: string, amount: string, productinfo: string,
  firstname: string, email: string,
  udfs: string[], // up to 10
  salt: string,
): string {
  const udfPadded = [...udfs, '', '', '', '', '', '', '', '', '', ''].slice(0, 10);
  return sha512hex(
    [key, txnid, amount, productinfo, firstname, email, ...udfPadded].join('|') + '|' + salt
  );
}

export interface EasebuzzPaymentResult {
  success:    boolean;
  linkUrl:    string | null;
  paymentRef: string | null;
  error?:     string;
}

/**
 * Create a hosted payment page link for a customer order.
 * Returns a URL like https://pay.easebuzz.in/pay/<access_key>
 */
export async function createEasebuzzPaymentLink(params: {
  paymentId:    string;
  contactPhone: string;
  contactName:  string | null;
  amountRupees: number;
  description?: string;
}): Promise<EasebuzzPaymentResult> {
  if (!KEY || !SALT || !SURL) {
    return { success: false, linkUrl: null, paymentRef: null, error: 'Easebuzz not configured' };
  }

  const txnid       = params.paymentId;
  const amount      = params.amountRupees.toFixed(2);
  const productinfo = (params.description ?? 'Order Payment').slice(0, 100);
  const firstname   = (params.contactName ?? 'Customer').slice(0, 60);
  const email       = '';
  const phone       = normalizePhone(params.contactPhone);
  const hash        = buildInitiateHash(KEY, txnid, amount, productinfo, firstname, email, [], SALT);

  const body = new URLSearchParams({ key: KEY, txnid, amount, productinfo, firstname, email, phone, surl: SURL, furl: SURL, hash });

  try {
    const res  = await fetch(`${PAY_BASE}payment/initiateLink`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });
    const data = await res.json() as { status: number; data?: string; error_desc?: string };

    if (!res.ok || data.status !== 1 || !data.data) {
      return { success: false, linkUrl: null, paymentRef: null, error: data.error_desc ?? 'initiateLink failed' };
    }
    return { success: true, linkUrl: `${PAY_BASE}pay/${data.data}`, paymentRef: txnid };
  } catch (err) {
    return { success: false, linkUrl: null, paymentRef: null, error: String(err) };
  }
}

/** Verify the reverse-hash on an Easebuzz surl/furl POST callback. */
export function verifyEasebuzzCallback(body: Record<string, string>): boolean {
  if (!SALT) return false;

  const computed = sha512hex([
    SALT,
    body['status']      ?? '',
    body['udf10']       ?? '',
    body['udf9']        ?? '',
    body['udf8']        ?? '',
    body['udf7']        ?? '',
    body['udf6']        ?? '',
    body['udf5']        ?? '',
    body['udf4']        ?? '',
    body['udf3']        ?? '',
    body['udf2']        ?? '',
    body['udf1']        ?? '',
    body['email']       ?? '',
    body['firstname']   ?? '',
    body['productinfo'] ?? '',
    body['amount']      ?? '',
    body['txnid']       ?? '',
    body['key']         ?? '',
  ].join('|'));

  const received = body['hash'] ?? '';
  if (computed.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(received));
}

export { KEY as EASEBUZZ_KEY, ENV as EASEBUZZ_ENV, DASH_BASE as EASEBUZZ_DASH_BASE, sha512hex };
