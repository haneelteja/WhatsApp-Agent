import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendEmail } from '@/lib/email';

describe('sendEmail', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns ok:true when Resend accepts the email', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response('{"id":"test-id"}', { status: 200 }),
    );

    const result = await sendEmail({
      to:      'user@example.com',
      subject: 'Test',
      html:    '<p>Hello</p>',
    });

    expect(result).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledOnce();

    const [url, options] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body as string);
    expect(body.to).toEqual(['user@example.com']);
    expect(body.subject).toBe('Test');
    expect(body.from).toContain('Alphabot');
  });

  it('uses RESEND_FROM_EMAIL env var as the sender address', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response('{}', { status: 200 }),
    );

    await sendEmail({ to: 'a@b.com', subject: 'S', html: '<p/>' });

    const [, options] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.from).toContain(process.env['RESEND_FROM_EMAIL']);
  });

  it('returns ok:false when RESEND_API_KEY is not set', async () => {
    const saved = process.env['RESEND_API_KEY'];
    delete process.env['RESEND_API_KEY'];

    const result = await sendEmail({ to: 'a@b.com', subject: 'S', html: '<p/>' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('RESEND_API_KEY not set');
    expect(global.fetch).not.toHaveBeenCalled();

    process.env['RESEND_API_KEY'] = saved;
  });

  it('returns ok:false when Resend responds with a non-200 status', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response('{"error":"domain not verified"}', { status: 422 }),
    );

    const result = await sendEmail({ to: 'a@b.com', subject: 'S', html: '<p/>' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('domain not verified');
  });

  it('returns ok:false when fetch itself throws (network error)', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network failure'));

    // sendEmail does not catch fetch errors itself — it surfaces via the Promise
    await expect(sendEmail({ to: 'a@b.com', subject: 'S', html: '<p/>' })).rejects.toThrow('Network failure');
  });

  it('sets Authorization header with Bearer token', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response('{}', { status: 200 }),
    );

    await sendEmail({ to: 'a@b.com', subject: 'S', html: '<p/>' });

    const [, options] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${process.env['RESEND_API_KEY']}`);
  });
});
