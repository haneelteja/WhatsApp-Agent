import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const KEY  = process.env['EASEBUZZ_MERCHANT_KEY'] ?? '';
const SALT = process.env['EASEBUZZ_SALT']          ?? '';

function sha512hex(str: string): string {
  return crypto.createHash('sha512').update(str).digest('hex');
}

function getBillingBase(req: NextRequest): string {
  // Use the request URL origin so this works regardless of env var state
  const origin = req.headers.get('origin')
    ?? req.headers.get('x-forwarded-proto') && req.headers.get('x-forwarded-host')
       ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('x-forwarded-host')}`
       : new URL(req.url).origin;
  return `${origin}/billing`;
}

const PLAN_AMOUNTS: Record<string, string> = {
  growth: '2499.00',
  scale:  '4999.00',
};

// Easebuzz POSTs here after payment (surl/furl). Verifies hash, updates plan, redirects back.
export async function POST(req: NextRequest) {
  const billingBase = getBillingBase(req);

  let body: Record<string, string>;
  try {
    const form = await req.formData();
    body = Object.fromEntries(
      [...form.entries()].map(([k, v]) => [k, String(v)])
    );
  } catch {
    return NextResponse.redirect(`${billingBase}?eb=failed`, { status: 303 });
  }

  const received = body['hash'] ?? '';
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
    KEY,
  ].join('|'));

  const hashValid =
    computed.length === received.length &&
    crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(received));

  if (!hashValid || body['status'] !== 'success') {
    return NextResponse.redirect(`${billingBase}?eb=failed`, { status: 303 });
  }

  const tenantId   = body['udf1'] ?? '';
  const targetPlan = body['udf2'] ?? '';

  if (!tenantId || !PLAN_AMOUNTS[targetPlan]) {
    return NextResponse.redirect(`${billingBase}?eb=failed`, { status: 303 });
  }

  const planExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const admin = getSupabaseAdminClient();
  await Promise.all([
    admin.from('tenants').update({
      plan:                targetPlan,
      status:              'active',
      subscription_status: 'active',
    }).eq('id', tenantId),
    admin.from('subscriptions')
      .update({ tier: targetPlan, next_billing_date: planExpiresAt })
      .eq('tenant_id', tenantId),
  ]);

  return NextResponse.redirect(`${billingBase}?eb=paid`, { status: 303 });
}

// GET handler so direct browser visits get a clean 405 instead of 500
export async function GET() {
  return new Response('Method not allowed', { status: 405 });
}
