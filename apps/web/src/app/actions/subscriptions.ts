'use server';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? '';

export type InitiateResult =
  | { linkUrl: string; txnId: string }
  | { error: string };

export async function initiateSubscriptionAction(
  company: string,
  email: string,
  plan: string,
): Promise<InitiateResult> {
  if (!API_BASE) return { error: 'API not configured' };

  try {
    const res = await fetch(`${API_BASE}/api/subscriptions/initiate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ company, email, plan }),
    });

    const data = await res.json() as { linkUrl?: string; txnId?: string; error?: string };

    if (!res.ok || !data.linkUrl) {
      return { error: data.error ?? 'Payment initiation failed' };
    }

    return { linkUrl: data.linkUrl, txnId: data.txnId ?? '' };
  } catch {
    return { error: 'Could not connect to payment server. Please try again.' };
  }
}
