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

// ── WhatsApp order status notification ───────────────────────────────────────
// Fired after a status update succeeds. Fire-and-forget — never blocks the
// response; errors are logged but do not propagate to the caller.

const STATUS_MESSAGES: Partial<Record<OrderStatus, (name: string, shortId: string, itemsSummary: string, total: number) => string>> = {
  confirmed: (name, shortId, summary, total) =>
    `✅ *Order Confirmed!*\n\nHi ${name}! Your order #${shortId} has been confirmed and is being prepared.\n\n📦 ${summary}\n💰 Total: ₹${total.toFixed(2)}\n\nWe'll notify you when it's dispatched. 🙏`,
  dispatched: (name, shortId, summary) =>
    `🚚 *Your Order Is On Its Way!*\n\nHi ${name}! Your order #${shortId} has been dispatched.\n\n📦 ${summary}\n\nExpected delivery in 2–3 business days. We'll notify you once it arrives! 📬`,
  delivered: (name, shortId) =>
    `📦 *Order Delivered!*\n\nHi ${name}! Your order #${shortId} has been delivered. 🎉\n\nThank you for choosing us! If you have any questions, just reply to this message.`,
  cancelled: (name, shortId) =>
    `❌ *Order Cancelled*\n\nHi ${name}. Your order #${shortId} has been cancelled. If this was unexpected or you need help, please reply to this message.`,
};

async function sendOrderStatusNotification(
  orderId: string,
  status: OrderStatus,
): Promise<void> {
  const buildFn = STATUS_MESSAGES[status];
  if (!buildFn) return;

  const admin = getSupabaseAdminClient();

  const { data: order } = await admin
    .from('orders')
    .select('tenant_id, total, items_json, contacts(phone, name)')
    .eq('id', orderId)
    .single();

  if (!order) return;

  const contact = order.contacts as unknown as { phone: string | null; name: string | null } | null;
  if (!contact?.phone) return;

  // Prefer the lifecycle_bot number, fall back to any active number for this tenant
  const { data: wn } = await admin
    .from('whatsapp_numbers')
    .select('config_json, provider')
    .eq('tenant_id', order.tenant_id)
    .eq('product_slug', 'lifecycle_bot')
    .eq('active', true)
    .maybeSingle();

  if (!wn) return;

  const shortId = orderId.slice(0, 8).toUpperCase();
  const items = (order.items_json as Array<{ name: string; quantity: number }>) ?? [];
  const itemsSummary = items.slice(0, 3).map(i => `${i.name} ×${i.quantity}`).join(', ')
    + (items.length > 3 ? ` +${items.length - 3} more` : '');
  const contactName = contact.name?.split(' ')[0] ?? 'there';
  const total = Number(order.total);

  const text = buildFn(contactName, shortId, itemsSummary, total);

  if (wn.provider === 'meta_cloud') {
    const cfg = wn.config_json as { phone_number_id: string; access_token: string };
    await fetch(`https://graph.facebook.com/v22.0/${cfg.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: contact.phone.replace(/\s+/g, ''),
        type: 'text',
        text: { body: text },
      }),
    });
  } else if (wn.provider === 'twilio') {
    const cfg = wn.config_json as { phone_number: string; credentials: string };
    const [credsPart] = cfg.credentials.split('|');
    const colonIdx   = credsPart!.indexOf(':');
    const accountSid = credsPart!.slice(0, colonIdx);
    const authToken  = credsPart!.slice(colonIdx + 1);

    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          From: `whatsapp:${cfg.phone_number}`,
          To:   `whatsapp:${contact.phone}`,
          Body: text,
        }).toString(),
      },
    );
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────

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

  // Notify customer via WhatsApp — fire and forget
  void sendOrderStatusNotification(orderId, status).catch(err =>
    console.error('[OrderNotify] WhatsApp notification failed:', err),
  );

  return { ok: true };
}
