'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const RAZORPAY_KEY_ID     = process.env['RAZORPAY_KEY_ID']     ?? '';
const RAZORPAY_KEY_SECRET = process.env['RAZORPAY_KEY_SECRET'] ?? '';

// ₹ amounts per plan per month (in paise)
export const PLAN_PRICING: Record<string, { amountPaise: number; label: string }> = {
  growth: { amountPaise: 249900, label: '₹2,499 / month' },
  scale:  { amountPaise: 499900, label: '₹4,999 / month' },
};

function basicAuth() {
  return 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
}

// ── Step 1: Create Razorpay order ─────────────────────────────────────────────
export async function createPlanUpgradeOrderAction(targetPlan: string): Promise<{
  orderId?: string;
  amount?: number;
  currency?: string;
  keyId?: string;
  tenantId?: string;
  tenantName?: string;
  error?: string;
}> {
  const pricing = PLAN_PRICING[targetPlan];
  if (!pricing) return { error: 'Invalid plan' };
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return { error: 'Razorpay not configured' };

  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!tenantUser) return { error: 'Tenant not found' };

  const { data: tenant } = await admin
    .from('tenants')
    .select('name, plan')
    .eq('id', tenantUser.tenant_id)
    .single();

  if (!tenant) return { error: 'Tenant not found' };
  if (tenant.plan === targetPlan) return { error: 'Already on this plan' };

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Authorization':  basicAuth(),
      'Content-Type':   'application/json',
    },
    body: JSON.stringify({
      amount:   pricing.amountPaise,
      currency: 'INR',
      receipt:  `plan_${targetPlan}_${tenantUser.tenant_id.slice(0, 8)}_${Date.now()}`,
      notes: {
        tenant_id:   tenantUser.tenant_id,
        target_plan: targetPlan,
        current_plan: tenant.plan,
      },
    }),
  });

  const data = await res.json() as { id?: string; error?: { description: string } };
  if (!res.ok || data.error) {
    return { error: data.error?.description ?? 'Failed to create order' };
  }

  return {
    orderId:    data.id,
    amount:     pricing.amountPaise,
    currency:   'INR',
    keyId:      RAZORPAY_KEY_ID,
    tenantId:   tenantUser.tenant_id,
    tenantName: tenant.name,
  };
}

// ── Step 2: Verify payment + upgrade plan ─────────────────────────────────────
export async function verifyPlanUpgradePaymentAction(
  razorpayOrderId:   string,
  razorpayPaymentId: string,
  razorpaySignature: string,
  targetPlan:        string,
): Promise<{ success?: boolean; error?: string }> {
  // Verify HMAC signature
  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  if (expected !== razorpaySignature) {
    return { error: 'Payment verification failed — invalid signature' };
  }

  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!tenantUser) return { error: 'Tenant not found' };

  const tenantId = tenantUser.tenant_id;

  // Update tenant plan
  await admin.from('tenants').update({ plan: targetPlan, status: 'active' }).eq('id', tenantId);

  // Update all subscriptions to the new tier
  await admin
    .from('subscriptions')
    .update({ tier: targetPlan })
    .eq('tenant_id', tenantId);

  revalidatePath('/billing');
  return { success: true };
}
