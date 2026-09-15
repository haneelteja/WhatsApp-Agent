import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { lead, analysis } = await req.json();

    const notifyEmail = process.env['PROSPECT_ADVISOR_EMAIL'] ?? 'pega2023test@gmail.com';

    const painList = lead.painPoints?.length
      ? lead.painPoints.map((p: string) => `<li style="margin:2px 0">${p}</li>`).join('')
      : '<li>Not specified</li>';

    const useCaseList = analysis?.use_cases?.length
      ? analysis.use_cases
          .map(
            (uc: { title: string; description: string; impact: string }) =>
              `<li style="margin:4px 0"><strong>${uc.title}</strong> — ${uc.description} <em>(${uc.impact})</em></li>`
          )
          .join('')
      : '';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,sans-serif;background:#f8fafc;padding:32px;color:#0f172a">
  <div style="max-width:600px;margin:0 auto">
    <div style="background:#22c55e;color:#fff;padding:16px 24px;border-radius:12px 12px 0 0">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;opacity:.8;margin-bottom:4px">Alphabot</div>
      <div style="font-size:20px;font-weight:700">New Prospect — AI Advisor Lead</div>
    </div>

    <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:24px">

      <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 12px">Contact Details</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px;width:140px">Name</td><td style="padding:6px 0;font-size:13px;font-weight:600">${lead.name}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Email</td><td style="padding:6px 0;font-size:13px"><a href="mailto:${lead.email}" style="color:#22c55e">${lead.email}</a></td></tr>
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Company</td><td style="padding:6px 0;font-size:13px;font-weight:600">${lead.company}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Role</td><td style="padding:6px 0;font-size:13px">${lead.role}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Industry</td><td style="padding:6px 0;font-size:13px">${lead.industry}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Company Size</td><td style="padding:6px 0;font-size:13px">${lead.companySize}</td></tr>
      </table>

      <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 12px">Business Profile</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px;width:140px">Daily Messages</td><td style="padding:6px 0;font-size:13px">${lead.dailyMessages}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Current Setup</td><td style="padding:6px 0;font-size:13px">${lead.currentHandling}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px;vertical-align:top">Pain Points</td><td style="padding:6px 0;font-size:13px"><ul style="margin:0;padding-left:16px">${painList}</ul></td></tr>
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Primary Goal</td><td style="padding:6px 0;font-size:13px">${lead.primaryGoal}</td></tr>
      </table>

      ${
        analysis
          ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-bottom:16px">
        <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#16a34a;margin:0 0 10px">AI Recommendation</h3>
        <div style="font-size:16px;font-weight:700;color:#15803d;margin-bottom:4px">${analysis.recommended_name} — ${analysis.recommended_price}</div>
        <div style="font-size:13px;color:#166534;margin-bottom:12px">${analysis.recommendation_reason}</div>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:4px 8px 4px 0;font-size:12px;color:#64748b">Monthly ROI</td>
            <td style="padding:4px 0;font-size:13px;font-weight:700;color:#15803d">₹${analysis.roi_monthly_savings?.toLocaleString('en-IN')}/mo</td>
          </tr>
          <tr>
            <td style="padding:4px 8px 4px 0;font-size:12px;color:#64748b">Payback Period</td>
            <td style="padding:4px 0;font-size:13px;font-weight:700;color:#15803d">${analysis.roi_payback_period}</td>
          </tr>
        </table>
      </div>
      ${
        useCaseList
          ? `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:16px 0 8px">Key Use Cases</h3>
      <ul style="margin:0;padding-left:16px;font-size:13px;color:#334155">${useCaseList}</ul>`
          : ''
      }
      `
          : ''
      }

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8">
        Submitted via Alphabot Prospect Advisor · ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
      </div>
    </div>
  </div>
</body>
</html>`;

    const result = await sendEmail({
      to: notifyEmail,
      subject: `New Lead: ${lead.name} — ${lead.company} (${lead.industry})`,
      html,
    });

    if (!result.ok) {
      console.error('[prospect-advisor/send-lead] Email failed:', result.error);
      // Don't block the user flow — log and continue
      return NextResponse.json({ ok: false, error: result.error });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[prospect-advisor/send-lead] Unexpected error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
