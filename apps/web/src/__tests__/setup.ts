import { vi } from 'vitest';

// ── Env vars must be set before any module imports them ────────────────────────
process.env['RAZORPAY_KEY_ID']     = 'rzp_test_testkey123';
process.env['RAZORPAY_KEY_SECRET'] = 'test_secret_key_abc123';
process.env['RESEND_API_KEY']      = 're_test_key_abc123';
process.env['RESEND_FROM_EMAIL']   = 'test@alphabot.test';
process.env['WEB_BASE_URL']        = 'https://test.alphabot.app';

// ── Global Next.js module mocks ───────────────────────────────────────────────
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag:  vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect:    vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  useRouter:   vi.fn(() => ({ refresh: vi.fn(), push: vi.fn() })),
  usePathname: vi.fn(() => '/'),
}));
