import { getServerClient } from '@alphabot/database';

/** Opt-out keywords that trigger automatic suppression (case-insensitive). */
const OPT_OUT_KEYWORDS = [
  'stop', 'unsubscribe', 'opt out', 'optout', 'opt-out',
  'remove me', 'no more messages', 'dont message', "don't message",
  'block', 'do not contact', 'dnc',
];

/** Returns true if the message text is an opt-out request. */
export function isOptOutMessage(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return OPT_OUT_KEYWORDS.some(kw => lower === kw || lower.startsWith(kw + ' ') || lower.endsWith(' ' + kw));
}

/** Returns true if this phone number is suppressed for this tenant. */
export async function isSuppressed(tenantId: string, phoneE164: string): Promise<boolean> {
  const db = getServerClient();
  const { data } = await db
    .from('contact_suppressions')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('phone_e164', normalisePhone(phoneE164))
    .maybeSingle();
  return !!data;
}

/** Writes a suppression record. Idempotent — safe to call multiple times. */
export async function writeSuppression(
  tenantId: string,
  phoneE164: string,
  reason: 'user_opt_out' | 'meta_complaint' | 'undeliverable' | 'manual' | 'regulatory',
): Promise<void> {
  const db = getServerClient();
  await db
    .from('contact_suppressions')
    .upsert(
      { tenant_id: tenantId, phone_e164: normalisePhone(phoneE164), reason },
      { onConflict: 'tenant_id,phone_e164', ignoreDuplicates: true },
    );
}

/** Normalise to E.164 — strip leading + for storage consistency. */
function normalisePhone(phone: string): string {
  return phone.startsWith('+') ? phone : `+${phone}`;
}
