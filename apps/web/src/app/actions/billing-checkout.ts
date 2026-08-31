'use server';

import crypto        from 'crypto';
import { revalidatePath }         from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession }             from '@/lib/session';

const RAZORPAY_KEY_ID     = process.env['RAZORPAY_KEY_ID']     ?? '';
const RAZORPAY_KEY_SECRET = process.env['RAZORPAY_KEY_SECRET'] ?? '';

export const PLAN_PRICING: Record<string, { amountPaise: number; label: string }> = {
  growth: { amountPaise: 249900, label: '₹2,499 / month' },
  scale:  { amountPaise: 499900, label: '₹4,999 / month' },
};

function basicAuth() {
  return 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
}

export async function createPlanUpgradeOrderAction(targetPlan: string): Promise<{
  orderId?:    string;
  amount?:     number;
  currency?:   string;
  keyId?:      string;
  tenantId?:   string;
  tenantName?: string;
  error?:      string;
}> {
  const pricing = PLAN_PRICING[targetPlan];
  if (!pricing) return { error: 'Invalid plan' };
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return { error: 'Razorpay not configured' };

  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = getSupabaseAdminClient();

  const { data: tenant } = await admin
    .from('tenants')
    .select('name, plan')
    .eq('id', session.tenantId)
    .single();

  if (!tenant) return { error: 'Tenant not found' };
  if (tenant.plan === targetPlan) return { error: 'Already on this plan' };

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Authorization': basicAuth(),
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      amount:   pricing.amountPaise,
      currency: 'INR',
      receipt:  `plan_${targetPlan}_${session.tenantId.slice(0, 8)}_${Date.now()}`,
      notes: {
        tenant_id:    session.tenantId,
        target_plan:  targetPlan,
        current_plan: tenant.plan,
      },
    }),
  });

  const data = await res.json() as { id?: string; error?: { description: string } };
  if (!res.ok || data.error) return { error: data.error?.description ?? 'Failed to create order' };

  return {
    orderId:    data.id,
    amount:     pricing.amountPaise,
    currency:   'INR',
    keyId:      RAZORPAY_KEY_ID,
    tenantId:   session.tenantId,
    tenantName: tenant.name,
  };
}

// targetPlan is NOT accepted from the client — it is read from Razorpay's own
// order notes (written server-side in Step 1) to prevent plan-escalation attacks.
export async function verifyPlanUpgradePaymentAction(
  razorpayOrderId:   string,
  razorpayPaymentId: string,
  razorpaySignature: string,
): Promise<{ success?: boolean; plan?: string; error?: string }> {
  if (!RAZORPAY_KEY_SECRET) return { error: 'Razorpay not configured' };

  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  if (expected !== razorpaySignature) return { error: 'Payment verification failed — invalid signature' };

  const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpayOrderId}`, {
    headers: { Authorization: basicAuth() },
  });
  if (!orderRes.ok) return { error: 'Could not verify order with Razorpay — please contact support' };

  const orderData = await orderRes.json() as {
    notes?: { tenant_id?: string; target_plan?: string };
    status?: string;
  };

  const targetPlan    = orderData.notes?.target_plan;
  const orderTenantId = orderData.notes?.tenant_id;

  if (!targetPlan || !PLAN_PRICING[targetPlan]) return { error: 'Invalid plan in payment order' };

  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  if (orderTenantId && orderTenantId !== session.tenantId) {
    return { error: 'Order does not belong to your account' };
  }

  const admin = getSupabaseAdminClient();
  await admin.from('tenants').update({ plan: targetPlan, status: 'active' }).eq('id', session.tenantId);
  await admin.from('subscriptions').update({ tier: targetPlan }).eq('tenant_id', session.tenantId);

  revalidatePath('/billing');
  return { success: true, plan: targetPlan };
}
