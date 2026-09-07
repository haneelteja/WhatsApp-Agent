import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const KEY  = process.env['EASEBUZZ_MERCHANT_KEY'] ?? '';
const SALT = process.env['EASEBUZZ_SALT']          ?? '';

function sha512hex(str: string): string {
  return crypto.createHash('sha512').update(str).digest('hex');
}

const PLAN_AMOUNTS: Record<string, string> = {
  growth: '2499.00',
  scale:  '4999.00',
};

export async function POST(req: Request) {
  const APP_URL = process.env['NEXT_PUBLIC_APP_URL'] ?? '';
  const billingBase = APP_URL ? `${APP_URL}/billing` : '/billing';

  let body: Record<string, string>;
  try {
    const form = await req.formData();
    body = Object.fromEntries(
      [...form.entries()].map(([k, v]) => [k, String(v)])
    );
  } catch {
    return NextResponse.redirect(`${billingBase}?eb=failed`);
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
