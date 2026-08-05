import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime     = 'nodejs';
export const maxDuration = 10;

// Lightweight ping to prevent the Supabase free-tier project from pausing
// due to inactivity (Supabase pauses after 7 days with no DB activity).
// Vercel calls this every hour via the cron schedule in vercel.json.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env['CRON_SECRET']}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin.from('tenants').select('id').limit(1).maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
}
