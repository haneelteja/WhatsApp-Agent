'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export type OrderStatus = 'pending' | 'confirmed' | 'dispatched' | 'delivered' | 'cancelled';

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  sku?: string;
}

export async function createOrderAction(
  tenantId: string,
  contactId: string,
  conversationId: string,
  items: OrderItem[],
  total: number,
  sendLink: boolean,
  provider: 'razorpay' | 'phonepe' = 'phonepe',
): Promise<{ ok: true; orderId: string; linkUrl: string | null } | { error: string }> {
  const apiBase = process.env['NEXT_PUBLIC_API_URL'] ?? '';
  if (!apiBase) return { error: 'API URL not configured' };

  try {
    const res = await fetch(`${apiBase}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, contactId, conversationId, items, total, sendLink, provider }),
    });

    const data = await res.json() as { order?: { id: string }; linkUrl?: string | null; error?: string };
    if (!res.ok || data.error) return { error: data.error ?? 'Failed to create order' };

    revalidatePath('/orders');
    return { ok: true, orderId: data.order?.id ?? '', linkUrl: data.linkUrl ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function updateOrderStatusAction(
  orderId: string,
  status: OrderStatus,
): Promise<{ ok: true } | { error: string }> {
  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) return { error: error.message };
  revalidatePath('/orders');
  return { ok: true };
}
