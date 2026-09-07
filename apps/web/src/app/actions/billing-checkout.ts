'use server';

import crypto             from 'crypto';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';

const RAZORPAY_KEY_ID     = process.env['RAZORPAY_KEY_ID']          ?? '';
const RAZORPAY_KEY_SECRET = process.env['RAZORPAY_KEY_SECRET']       ?? '';

// Razorpay Plan IDs — created once in the Razorpay dashboard.
// Monthly recurring: Growth = ₹2,499 | Scale = ₹4,999
const PLAN_IDS: Record<string, string> = {
  growth: process.env['RAZORPAY_PLAN_ID_GROWTH'] ?? '',
  scale:  process.env['RAZORPAY_PLAN_ID_SCALE']  ?? '',
};

export const PLAN_PRICING: Record<string, { amountPaise: number; label: string }> = {
  growth: { amountPaise: 249900, label: '₹2,499 / month' },
  scale:  { amountPaise: 499900, label: '₹4,999 / month' },
};

function basicAuth() {
  return 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
}

// ── Step 1: create a Razorpay Subscription ───────────────────────────────────
// Returns the subscription_id which the client passes to the checkout modal
// (replaces the old order-based createPlanUpgradeOrderAction).
export async function createRazorpaySubscriptionAction(targetPlan: string): Promise<{
  subscriptionId?: string;
  keyId?:          string;
  tenantId?:       string;
  tenantName?:     string;
  error?:          string;
}> {
  const planId = PLAN_IDS[targetPlan];
  if (!planId)               return { error: 'Plan not configured — contact support' };
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return { error: 'Razorpay not configured' };

  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();

  const { data: tenant } = await admin
    .from('tenants')
    .select('name, plan, razorpay_subscription_id, subscription_status')
    .eq('id', session.tenantId)
    .single();

  if (!tenant) return { error: 'Tenant not found' };
  if (tenant.plan === targetPlan) return { error: 'Already on this plan' };

  // If there's an active subscription, cancel it before creating the new one
  const existingSubId = (tenant as { razorpay_subscription_id?: string | null }).razorpay_subscription_id;
  const existingStatus = (tenant as { subscription_status?: string | null }).subscription_status;
  if (existingSubId && existingStatus === 'active') {
    await fetch(`https://api.razorpay.com/v1/subscriptions/${existingSubId}/cancel`, {
      method: 'POST',
      headers: { Authorization: basicAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancel_at_cycle_end: 0 }),
    });
  }

  const res = await fetch('https://api.razorpay.com/v1/subscriptions', {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id:         planId,
      total_count:     120,   // 10 years — effectively indefinite
      quantity:        1,
      customer_notify: 1,
      notes: {
        tenant_id:   session.tenantId,
        target_plan: targetPlan,
      },
    }),
  });

  const data = await res.json() as { id?: string; error?: { description: string } };
  if (!res.ok || data.error) return { error: data.error?.description ?? 'Failed to create subscription' };

  return {
    subscriptionId: data.id,
    keyId:          RAZORPAY_KEY_ID,
    tenantId:       session.tenantId,
    tenantName:     tenant.name,
  };
}

// ── Step 2: verify payment and activate plan ─────────────────────────────────
// targetPlan is read from Razorpay's subscription notes — never from the client.
export async function verifySubscriptionPaymentAction(
  razorpaySubscriptionId: string,
  razorpayPaymentId:      string,
  razorpaySignature:      string,
): Promise<{ success?: boolean; plan?: string; error?: string }> {
  if (!RAZORPAY_KEY_SECRET) return { error: 'Razorpay not configured' };

  // Signature for subscriptions: sha256(paymentId + "|" + subscriptionId)
  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpayPaymentId}|${razorpaySubscriptionId}`)
    .digest('hex');

  if (expected !== razorpaySignature) return { error: 'Payment verification failed — invalid signature' };

  // Fetch subscription to read notes.target_plan (prevents client-side escalation)
  const subRes = await fetch(`https://api.razorpay.com/v1/subscriptions/${razorpaySubscriptionId}`, {
    headers: { Authorization: basicAuth() },
  });
  if (!subRes.ok) return { error: 'Could not verify subscription with Razorpay' };

  const subData = await subRes.json() as {
    notes?:       { tenant_id?: string; target_plan?: string };
    status?:      string;
    current_end?: number;
  };

  const targetPlan    = subData.notes?.target_plan;
  const subTenantId   = subData.notes?.tenant_id;
  if (!targetPlan || !PLAN_PRICING[targetPlan]) return { error: 'Invalid plan in subscription' };

  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };
  if (subTenantId && subTenantId !== session.tenantId) return { error: 'Subscription does not belong to your account' };

  const admin = getSupabaseAdminClient();

  const nextBillingDate = subData.current_end
    ? new Date(subData.current_end * 1000).toISOString().slice(0, 10)
    : null;

  await Promise.all([
    admin.from('tenants').update({
      plan:                     targetPlan,
      status:                   'active',
      razorpay_subscription_id: razorpaySubscriptionId,
      subscription_status:      'active',
    }).eq('id', session.tenantId),
    nextBillingDate
      ? admin.from('subscriptions')
          .update({ tier: targetPlan, next_billing_date: nextBillingDate })
          .eq('tenant_id', session.tenantId)
      : Promise.resolve(),
  ]);

  revalidatePath('/billing');
  return { success: true, plan: targetPlan };
}

// ── Cancel subscription at end of current billing cycle ──────────────────────
export async function cancelSubscriptionAction(): Promise<{ success?: boolean; error?: string }> {
  if (!RAZORPAY_KEY_SECRET) return { error: 'Razorpay not configured' };

  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();
  const { data: tenant } = await admin
    .from('tenants')
    .select('razorpay_subscription_id, subscription_status')
    .eq('id', session.tenantId)
    .single();

  const subId = (tenant as { razorpay_subscription_id?: string | null } | null)?.razorpay_subscription_id;
  if (!subId) return { error: 'No active subscription found' };

  const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${subId}/cancel`, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancel_at_cycle_end: 1 }),  // cancels at period end, not immediately
  });

  if (!res.ok) {
    const err = await res.json() as { error?: { description: string } };
    return { error: err.error?.description ?? 'Failed to cancel subscription' };
  }

  await admin.from('tenants')
    .update({ subscription_status: 'cancelled' })
    .eq('id', session.tenantId);

  revalidatePath('/billing');
  return { success: true };
}
