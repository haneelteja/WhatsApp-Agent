import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const KEY  = process.env['EASEBUZZ_MERCHANT_KEY'] ?? '';
const SALT = process.env['EASEBUZZ_SALT']          ?? '';

function sha512hex(str: string): string {
  return crypto.createHash('sha512').update(str).digest('hex');
}

function getOrigin(req: NextRequest): string {
  // 1. Origin header sent by browser
  const origin = req.headers.get('origin');
  if (origin) return origin;
  // 2. Vercel/reverse-proxy headers
  const proto = req.headers.get('x-forwarded-proto');
  const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (proto && host) return `${proto}://${host}`;
  // 3. Parse from the request URL itself
  try { return new URL(req.url).origin; } catch { /* fall through */ }
  // 4. Hard fallback
  return process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://whats-app-agent-web.vercel.app';
}

const PLAN_AMOUNTS: Record<string, string> = {
  growth: '2499.00',
  scale:  '4999.00',
};

// Easebuzz POSTs here after payment (surl/furl callback).
// Verifies hash, updates the tenant plan, then redirects browser back to /billing.
export async function POST(req: NextRequest) {
  const origin      = getOrigin(req);
  const billingBase = `${origin}/billing`;

  try {
    // Parse form body — Easebuzz sends application/x-www-form-urlencoded
    let body: Record<string, string> = {};
    try {
      const form = await req.formData();
      body = Object.fromEntries(
        [...form.entries()].map(([k, v]) => [k, String(v)])
      );
    } catch {
      // Fallback: parse raw URL-encoded text
      const text = await req.text();
      for (const pair of text.split('&')) {
        const [k, v] = pair.split('=').map(decodeURIComponent);
        if (k) body[k] = v ?? '';
      }
    }

    const status   = body['status']   ?? '';
    const received = body['hash']     ?? '';

    // Verify reverse hash: SALT|status|udf10..udf1|email|firstname|productinfo|amount|txnid|key
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
      return NextResponse.redirect(`${billingBase}?eb=failed`, { status: 303 });
    }

    const tenantId   = body['udf1'] ?? '';
    const targetPlan = body['udf2'] ?? '';

    if (!tenantId || !PLAN_AMOUNTS[targetPlan]) {
      return NextResponse.redirect(`${billingBase}?eb=failed`, { status: 303 });
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

    return NextResponse.redirect(`${billingBase}?eb=paid`, { status: 303 });

  } catch (err) {
    console.error('[billing/easebuzz] callback error:', err);
    return NextResponse.redirect(`${billingBase}?eb=failed`, { status: 303 });
  }
}

// GET handler for direct browser visits (e.g. when Easebuzz uses a GET redirect)
export async function GET(req: NextRequest) {
  const origin = getOrigin(req);
  const url    = new URL(req.url);
  const eb     = url.searchParams.get('eb') ?? 'failed';
  return NextResponse.redirect(`${origin}/billing?eb=${eb}`, { status: 303 });
}
