import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const KEY  = process.env['EASEBUZZ_MERCHANT_KEY'] ?? '';
const SALT = process.env['EASEBUZZ_SALT']          ?? '';

function sha512hex(str: string): string {
  return crypto.createHash('sha512').update(str).digest('hex');
}

function getBaseUrl(req: NextRequest): string {
  // Prefer x-forwarded headers (set by Vercel)
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
  if (host) return `${proto}://${host}`;
  // Fall back to parsing req.url (always full URL in Next.js App Router)
  try { return new URL(req.url).origin; } catch { /* ignore */ }
  // NEXT_PUBLIC_APP_URL may be set without a protocol — normalise it
  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? '';
  if (appUrl) return appUrl.startsWith('http') ? appUrl : `https://${appUrl}`;
  return 'https://whats-app-agent-web.vercel.app';
}

/** Return an HTML page that immediately redirects the browser.
 *  More compatible than 303 when Easebuzz controls the navigation. */
function htmlRedirect(url: string): Response {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0;url=${url}">
  <script>window.location.replace(${JSON.stringify(url)});</script>
</head>
<body>Redirecting…</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

const PLAN_AMOUNTS: Record<string, string> = {
  growth: '2499.00',
  scale:  '4999.00',
};

// Easebuzz POSTs here after payment (surl/furl callback).
// Returns an HTML auto-redirect so the browser navigates to /billing regardless
// of whether Easebuzz's page or the user's browser made the POST.
export async function POST(req: NextRequest) {
  const base    = getBaseUrl(req);
  const success = `${base}/billing?eb=paid`;
  const failure = `${base}/billing?eb=failed`;

  try {
    let body: Record<string, string> = {};

    // Parse form body — try formData first, fall back to URL-encoded text
    try {
      const form = await req.formData();
      body = Object.fromEntries(
        [...form.entries()].map(([k, v]) => [k, String(v)])
      );
    } catch {
      const text = await req.text();
      for (const pair of text.split('&')) {
        const idx = pair.indexOf('=');
        if (idx === -1) continue;
        const k = decodeURIComponent(pair.slice(0, idx).replace(/\+/g, ' '));
        const v = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, ' '));
        if (k) body[k] = v;
      }
    }

    const status   = body['status']  ?? '';
    const received = body['hash']    ?? '';

    // Reverse hash: SALT|status|udf10..udf1|email|firstname|productinfo|amount|txnid|key
    const computed = sha512hex([
      SALT, status,
      body['udf10'] ?? '', body['udf9'] ?? '', body['udf8'] ?? '',
      body['udf7']  ?? '', body['udf6'] ?? '', body['udf5'] ?? '',
      body['udf4']  ?? '', body['udf3'] ?? '', body['udf2'] ?? '',
      body['udf1']  ?? '',
      body['email']       ?? '',
      body['firstname']   ?? '',
      body['productinfo'] ?? '',
      body['amount']      ?? '',
      body['txnid']       ?? '',
      KEY,
    ].join('|'));

    const hashValid =
      received.length > 0 &&
      computed.length === received.length &&
      crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(received));

    if (!hashValid || status !== 'success') {
      return htmlRedirect(failure);
    }

    const tenantId   = body['udf1'] ?? '';
    const targetPlan = body['udf2'] ?? '';

    if (!tenantId || !PLAN_AMOUNTS[targetPlan]) {
      return htmlRedirect(failure);
    }

    const planExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const admin = getSupabaseAdminClient();
    await Promise.all([
      admin.from('tenants').update({
        plan:                targetPlan,
        status:              'active',
        subscription_status: 'active',
      }).eq('id', tenantId),
      admin.from('subscriptions')
        .update({ tier: targetPlan, next_billing_date: planExpiresAt })
        .eq('tenant_id', tenantId),
    ]);

    return htmlRedirect(success);

  } catch (err) {
    console.error('[billing/easebuzz] callback error:', err);
    return htmlRedirect(failure);
  }
}

// GET handler — Easebuzz may also redirect the browser here via GET after payment
export async function GET(req: NextRequest) {
  const base = getBaseUrl(req);
  const eb   = new URL(req.url).searchParams.get('eb') ?? 'failed';
  return NextResponse.redirect(`${base}/billing?eb=${eb}`, { status: 303 });
}
