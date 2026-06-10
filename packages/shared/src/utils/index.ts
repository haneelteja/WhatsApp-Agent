export function slugify(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

export function truncate(str: string, maxLen: number): string {
  return str.length <= maxLen ? str : `${str.slice(0, maxLen - 1)}…`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function assertEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export function parsePhoneNumber(raw: string): string {
  // Normalise to E.164 without the leading +
  return raw.replace(/\D/g, '');
}
