import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendEmail }              from '@/lib/email';

export const runtime     = 'nodejs';
export const maxDuration = 30;

// Runs daily at 09:00 IST (03:30 UTC) via vercel.json cron.
// Sends renewal reminder emails at 7 days and 3 days before plan_expires_at.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env['CRON_SECRET']}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const now   = new Date();

  // Find tenants with plan_expires_at in the next 8 days (non-starter, non-cancelled)
  const eightDaysOut = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString();

  const { data: tenants, error } = await admin
    .from('tenants')
    .select('id, name, contact_email, plan, plan_expires_at, renewal_7d_reminded_at, renewal_3d_reminded_at')
    .not('plan_expires_at', 'is', null)
    .lte('plan_expires_at', eightDaysOut)
    .gte('plan_expires_at', now.toISOString())
    .neq('subscription_status', 'cancelled')
    .neq('plan', 'starter');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const webUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://app.alphabot.in';
  const results = { sent_7d: 0, sent_3d: 0, skipped: 0 };

  for (const t of tenants ?? []) {
    const expiresAt  = new Date(t.plan_expires_at as string);
    const daysLeft   = Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000);
    const email      = t.contact_email as string | null;
    if (!email) { results.skipped++; continue; }

    const planLabel = (t.plan as string).charAt(0).toUpperCase() + (t.plan as string).slice(1);
    const expiryStr = expiresAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    // 7-day reminder
    if (daysLeft <= 7 && !(t.renewal_7d_reminded_at)) {
      const html = buildReminderEmail({ name: t.name as string, plan: planLabel, expiryStr, daysLeft, webUrl });
      await sendEmail({ to: email, subject: `Your Alphabot ${planLabel} plan renews in ${daysLeft} days`, html });
      await admin.from('tenants').update({ renewal_7d_reminded_at: now.toISOString() }).eq('id', t.id);
      results.sent_7d++;
      continue;
    }

    // 3-day reminder (only if 7d was already sent or close enough)
    if (daysLeft <= 3 && !(t.renewal_3d_reminded_at)) {
      const html = buildReminderEmail({ name: t.name as string, plan: planLabel, expiryStr, daysLeft, webUrl });
      await sendEmail({ to: email, subject: `Reminder: Alphabot ${planLabel} plan expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`, html });
      await admin.from('tenants').update({ renewal_3d_reminded_at: now.toISOString() }).eq('id', t.id);
      results.sent_3d++;
    }
  }

  return NextResponse.json({ ok: true, timestamp: now.toISOString(), ...results });
}

function buildReminderEmail({
  name, plan, expiryStr, daysLeft, webUrl,
}: {
  name: string; plan: string; expiryStr: string; daysLeft: number; webUrl: string;
}): string {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fff;">
  <div style="margin-bottom:28px;">
    <span style="font-weight:700;font-size:20px;color:#111">Alphabot</span>
  </div>
  <h2 style="font-size:22px;font-weight:700;color:#111;margin:0 0 8px">
    Your ${plan} plan expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}
  </h2>
  <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px">
    Hi <strong>${name}</strong>,<br/>
    Your Alphabot <strong>${plan}</strong> subscription expires on <strong>${expiryStr}</strong>.
    Renew now to keep your bots running without interruption.
  </p>
  <a href="${webUrl}/billing" style="display:inline-block;background:#059669;color:#fff;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;text-decoration:none;margin-bottom:32px;">
    Renew Plan →
  </a>
  <p style="color:#9ca3af;font-size:12px;margin:0;">
    If you have already renewed or have any questions, please contact your Alphabot account manager.
  </p>
</div>`;
}
