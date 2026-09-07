'use server';

import crypto             from 'crypto';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';

const KEY     = process.env['EASEBUZZ_MERCHANT_KEY'] ?? '';
const SALT    = process.env['EASEBUZZ_SALT']          ?? '';
const ENV     = process.env['EASEBUZZ_ENV']            ?? 'test';
const APP_URL = process.env['NEXT_PUBLIC_APP_URL']    ?? 'https://app.alphabot.in';

const PAY_BASE  = ENV === 'prod' ? 'https://pay.easebuzz.in/'       : 'https://testpay.easebuzz.in/';
const DASH_BASE = ENV === 'prod' ? 'https://dashboard.easebuzz.in/' : 'https://testdashboard.easebuzz.in/';

const PLAN_AMOUNTS: Record<string, string> = {
  growth: '2499.00',
  scale:  '4999.00',
};

const PLAN_LABELS: Record<string, string> = {
  growth: 'Alphabot Growth Plan',
  scale:  'Alphabot Scale Plan',
};

function sha512hex(str: string): string {
  return crypto.createHash('sha512').update(str).digest('hex');
}

function buildInitiateHash(
  key: string, txnid: string, amount: string, productinfo: string,
  firstname: string, email: string, udf1: string, udf2: string, salt: string,
): string {
  // udf3–udf7 empty, udf8–udf10 always empty
  return sha512hex(
    [key, txnid, amount, productinfo, firstname, email,
     udf1, udf2, '', '', '', '', '', '', '', ''].join('|') + '|' + salt
  );
}

// ── Step 1: Create Easebuzz billing payment — returns access_key for checkout SDK
export async function createEasebuzzBillingPaymentAction(targetPlan: string): Promise<{
  accessKey?:   string;
  merchantKey?: string;
  env?:         string;
  error?:       string;
}> {
  const amount = PLAN_AMOUNTS[targetPlan];
  if (!amount)            return { error: 'Invalid plan' };
  if (!KEY || !SALT)      return { error: 'Payment gateway not configured — contact support' };

  const session = await getSession();
  if (!session)           return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();
  const { data: tenant } = await admin
    .from('tenants')
    .select('name, plan')
    .eq('id', session.tenantId)
    .single();

  if (!tenant)                       return { error: 'Tenant not found' };
  if (tenant.plan === targetPlan)    return { error: 'Already on this plan' };

  const txnid       = crypto.randomUUID().replace(/-/g, '');
  const productinfo = PLAN_LABELS[targetPlan] ?? `Alphabot ${targetPlan} Plan`;
  const firstname   = (tenant.name ?? 'User').slice(0, 60);
  const email       = session.userEmail ?? '';
  // udf1 = tenantId, udf2 = targetPlan — embedded in hash so they're tamper-evident
  const udf1        = session.tenantId;
  const udf2        = targetPlan;
  const surl        = `${APP_URL}/billing?eb=success`;
  const furl        = `${APP_URL}/billing?eb=failed`;
  const hash        = buildInitiateHash(KEY, txnid, amount, productinfo, firstname, email, udf1, udf2, SALT);

  const body = new URLSearchParams({
    key: KEY, txnid, amount, productinfo, firstname, email,
    phone: '9999999999',   // required by Easebuzz; billing doesn't need SMS
    udf1, udf2,
    surl, furl, hash,
  });

  try {
    const res  = await fetch(`${PAY_BASE}payment/initiateLink`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });
    const data = await res.json() as { status: number; data?: string; error_desc?: string };

    if (!res.ok || data.status !== 1 || !data.data) {
      return { error: data.error_desc ?? 'Failed to initiate payment. Please try again.' };
    }

    return { accessKey: data.data, merchantKey: KEY, env: ENV };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Something went wrong. Please try again.' };
  }
}

// ── Step 2: Verify EasebuzzCheckout onResponse data + activate plan ───────────
// callbackData is the object passed to onResponse() from the Easebuzz SDK
export async function verifyEasebuzzBillingPaymentAction(
  callbackData: Record<string, string>,
): Promise<{ success?: boolean; plan?: string; error?: string }> {
  if (!SALT || !KEY) return { error: 'Payment gateway not configured' };

  // Reverse-hash verification (SHA-512 with reversed field order)
  const computed = sha512hex([
    SALT,
    callbackData['status']      ?? '',
    callbackData['udf10']       ?? '',
    callbackData['udf9']        ?? '',
    callbackData['udf8']        ?? '',
    callbackData['udf7']        ?? '',
    callbackData['udf6']        ?? '',
    callbackData['udf5']        ?? '',
    callbackData['udf4']        ?? '',
    callbackData['udf3']        ?? '',
    callbackData['udf2']        ?? '',
    callbackData['udf1']        ?? '',
    callbackData['email']       ?? '',
    callbackData['firstname']   ?? '',
    callbackData['productinfo'] ?? '',
    callbackData['amount']      ?? '',
    callbackData['txnid']       ?? '',
    callbackData['key']         ?? '',
  ].join('|'));

  const received  = callbackData['hash'] ?? '';
  const hashValid = computed.length === received.length &&
    crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(received));

  if (!hashValid)                               return { error: 'Payment verification failed — invalid signature' };
  if (callbackData['status'] !== 'success')     return { error: 'Payment was not completed' };

  // udf1/udf2 are hash-verified so they can't be forged
  const tenantId   = callbackData['udf1'] ?? '';
  const targetPlan = callbackData['udf2'] ?? '';
  const txnid      = callbackData['txnid'] ?? '';

  if (!targetPlan || !PLAN_AMOUNTS[targetPlan]) return { error: 'Invalid plan in payment data' };

  const session = await getSession();
  if (!session)                                 return { error: 'Not authenticated' };
  if (tenantId && tenantId !== session.tenantId) return { error: 'Payment does not belong to your account' };

  // Authoritative server-side confirmation — fail open if API is unreachable
  try {
    const hash      = sha512hex(`${KEY}|${txnid}|${SALT}`);
    const verifyBody = new URLSearchParams({ key: KEY, txnid, hash });
    const verRes    = await fetch(`${DASH_BASE}transaction/v2/retrieve`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    verifyBody.toString(),
    });
    const verData = await verRes.json() as { status: number; data?: { status?: string } };
    if (verRes.ok && verData.status === 1 && verData.data?.status !== 'success') {
      return { error: 'Payment not confirmed by Easebuzz — please contact support if amount was deducted' };
    }
  } catch {
    // Network error — hash is already verified above, proceed
  }

  // Plan expiry: 30 days from today
  const planExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const admin = getSupabaseAdminClient();
  await Promise.all([
    admin.from('tenants').update({
      plan:                targetPlan,
      status:              'active',
      subscription_status: 'active',
    }).eq('id', session.tenantId),
    admin.from('subscriptions')
      .update({ tier: targetPlan, next_billing_date: planExpiresAt })
      .eq('tenant_id', session.tenantId),
  ]);

  revalidatePath('/billing');
  return { success: true, plan: targetPlan };
}

// ── Cancel plan locally — no Easebuzz API call needed ────────────────────────
// Plan access continues until next_billing_date; cron job handles expiry.
export async function cancelPlanAction(): Promise<{ success?: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();
  await admin.from('tenants')
    .update({ subscription_status: 'cancelled' })
    .eq('id', session.tenantId);

  revalidatePath('/billing');
  return { success: true };
}
