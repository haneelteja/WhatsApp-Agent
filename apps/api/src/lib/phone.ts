/**
 * Generate phone number variants to retry on Meta error 131030
 * ("recipient phone number not in allowed list").
 *
 * WhatsApp numbers are registered with varying trunk-prefix conventions
 * depending on country (e.g. India uses 0-prefix, Brazil uses 0xx, etc).
 * This function produces all plausible variants of a phone number so the
 * caller can retry the send until one succeeds.
 */
export function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, '');
  const variants = new Set<string>();

  // Always try E.164 with + and without
  variants.add(`+${digits}`);
  variants.add(digits);

  // If number starts with 0 (trunk prefix), try without it
  if (digits.startsWith('0') && digits.length > 8) {
    const withoutTrunk = digits.slice(1);
    variants.add(`+${withoutTrunk}`);
    variants.add(withoutTrunk);
  }

  // If number does NOT start with 0, try adding trunk prefix
  if (!digits.startsWith('0') && digits.length >= 10) {
    variants.add(`0${digits}`);
  }

  // Remove the original so we don't retry the same number first
  variants.delete(phone);

  return [...variants];
}

/** Meta Cloud API error code for "recipient phone number not in allowed list". */
export const META_RECIPIENT_NOT_ALLOWED = 131030;
