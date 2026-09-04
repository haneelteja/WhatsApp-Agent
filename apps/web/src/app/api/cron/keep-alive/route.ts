import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime     = 'nodejs';
export const maxDuration = 15;

// Runs every hour via vercel.json cron.
// 1. Pings Supabase DB (free tier pauses after 7 days of inactivity).
// 2. Pings the Render API server (free tier sleeps after 15 min of inactivity).
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env['CRON_SECRET']}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = { timestamp: new Date().toISOString() };

  // ── 1. Supabase DB ping ───────────────────────────────────────────────────
  try {
    const admin = getSupabaseAdminClient();
    const { error } = await admin.from('tenants').select('id').limit(1).maybeSingle();
    results['db'] = error ? { ok: false, error: error.message } : { ok: true };
  } catch (err) {
    results['db'] = { ok: false, error: String(err) };
  }

  // ── 2. Render API server ping ─────────────────────────────────────────────
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? process.env['API_URL'];
  if (apiUrl) {
    try {
      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(`${apiUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
        cache:  'no-store',
      });
      clearTimeout(timeout);
      results['api'] = { ok: res.ok, status: res.status };
    } catch (err) {
      results['api'] = { ok: false, error: String(err) };
    }
  } else {
    results['api'] = { skipped: 'API_URL not set' };
  }

  const allOk = Object.values(results).every(
    v => typeof v === 'string' || (v as Record<string, unknown>)['ok'] !== false,
  );

  return NextResponse.json({ ok: allOk, ...results }, { status: allOk ? 200 : 500 });
}
