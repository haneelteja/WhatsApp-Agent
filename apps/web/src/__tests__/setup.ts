import { vi } from 'vitest';

// ── Env vars must be set before any module imports them ────────────────────────
process.env['RAZORPAY_KEY_ID']     = 'rzp_test_testkey123';
process.env['RAZORPAY_KEY_SECRET'] = 'test_secret_key_abc123';
process.env['RESEND_API_KEY']      = 're_test_key_abc123';
process.env['RESEND_FROM_EMAIL']   = 'test@alphabot.test';
process.env['WEB_BASE_URL']        = 'https://test.alphabot.app';

// ── React shims ───────────────────────────────────────────────────────────────
// react.cache() is a React 18 RSC API that deduplicates calls within a render
// pass. The vitest Node environment has no React runtime, so importing it throws
// "cache is not a function". Shim it as a plain identity wrapper — correct for
// tests since per-request deduplication is irrelevant outside a React tree.
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn };
});

// ── Global Next.js module mocks ───────────────────────────────────────────────
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag:  vi.fn(),
  unstable_cache: vi.fn(<T extends (...args: unknown[]) => unknown>(fn: T) => fn),
}));

vi.mock('next/navigation', () => ({
  redirect:    vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  useRouter:   vi.fn(() => ({ refresh: vi.fn(), push: vi.fn() })),
  usePathname: vi.fn(() => '/'),
}));
