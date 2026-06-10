import { Resend } from 'resend';
import { getServerClient } from '@alphabot/database';

const resend = new Resend(process.env['RESEND_API_KEY']);

interface BotStat {
  product_type: string;
  newToday: number;
  open: number;
  escalated: number;
  resolved: number;
}

interface PendingEscalation {
  id: string;
  contact: string;
  reason: string;
  ageMinutes: number;
}

interface ReportData {
  tenantName: string;
  date: string;
  newToday: number;
  open: number;
  escalated: number;
  resolvedToday: number;
  bots: BotStat[];
  pendingEscalations: PendingEscalation[];
  dashboardUrl: string;
}

function botLabel(type: string): string {
  return type.replace(/_bot$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' Bot';
}

function ageLabel(mins: number): string {
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

function buildHtml(d: ReportData): string {
  const escRows = d.pendingEscalations.length
    ? d.pendingEscalations.map(e => `
        <tr>
          <td style="padding:10px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f0fdf4;">${e.contact}</td>
          <td style="padding:10px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f0fdf4;">${e.reason}</td>
          <td style="padding:10px 12px;font-size:13px;color:#ef4444;font-weight:600;border-bottom:1px solid #f0fdf4;">${ageLabel(e.ageMinutes)}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:16px 12px;font-size:13px;color:#9ca3af;text-align:center;">No pending escalations</td></tr>`;

  const botRows = d.bots.map(b => `
    <tr>
      <td style="padding:10px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f0fdf4;">${botLabel(b.product_type)}</td>
      <td style="padding:10px 12px;font-size:13px;color:#059669;font-weight:600;text-align:center;border-bottom:1px solid #f0fdf4;">${b.newToday}</td>
      <td style="padding:10px 12px;font-size:13px;color:#3b82f6;font-weight:600;text-align:center;border-bottom:1px solid #f0fdf4;">${b.open}</td>
      <td style="padding:10px 12px;font-size:13px;color:#ef4444;font-weight:600;text-align:center;border-bottom:1px solid #f0fdf4;">${b.escalated}</td>
      <td style="padding:10px 12px;font-size:13px;color:#6b7280;font-weight:600;text-align:center;border-bottom:1px solid #f0fdf4;">${b.resolved}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alphabot Daily Report</title></head>
<body style="margin:0;padding:0;background:#f3fdf5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3fdf5;">
  <tr><td align="center" style="padding:32px 16px;">
    <table cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr><td style="background:#071c0f;border-radius:16px 16px 0 0;padding:20px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td><span style="color:#34d399;font-size:18px;font-weight:700;letter-spacing:-0.5px;">Alphabot</span><span style="color:#166534;font-size:12px;margin-left:8px;">AI Agent Platform</span></td>
          <td align="right"><span style="color:#4b5563;font-size:12px;">Daily Report</span></td>
        </tr></table>
      </td></tr>

      <!-- Title -->
      <tr><td style="background:white;padding:24px 28px 8px;">
        <h1 style="margin:0;font-size:20px;font-weight:700;color:#111827;">Performance Summary</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">${d.tenantName} &nbsp;·&nbsp; ${d.date}</p>
      </td></tr>

      <!-- Stat cards -->
      <tr><td style="background:white;padding:16px 28px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="25%" style="padding:4px;">
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;text-align:center;">
              <div style="font-size:28px;font-weight:700;color:#059669;">${d.newToday}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:4px;">New Today</div>
            </div>
          </td>
          <td width="25%" style="padding:4px;">
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px;text-align:center;">
              <div style="font-size:28px;font-weight:700;color:#2563eb;">${d.open}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:4px;">Open</div>
            </div>
          </td>
          <td width="25%" style="padding:4px;">
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;text-align:center;">
              <div style="font-size:28px;font-weight:700;color:#dc2626;">${d.escalated}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:4px;">Escalated</div>
            </div>
          </td>
          <td width="25%" style="padding:4px;">
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;">
              <div style="font-size:28px;font-weight:700;color:#374151;">${d.resolvedToday}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:4px;">Resolved</div>
            </div>
          </td>
        </tr></table>
      </td></tr>

      <!-- Bot breakdown -->
      <tr><td style="background:white;padding:0 28px 24px;border-top:1px solid #f0fdf4;">
        <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#374151;">By Bot</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0fdf4;border-radius:10px;overflow:hidden;">
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#9ca3af;text-align:left;border-bottom:1px solid #f0fdf4;">Bot</th>
            <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#9ca3af;text-align:center;border-bottom:1px solid #f0fdf4;">New</th>
            <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#9ca3af;text-align:center;border-bottom:1px solid #f0fdf4;">Open</th>
            <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#9ca3af;text-align:center;border-bottom:1px solid #f0fdf4;">Escalated</th>
            <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#9ca3af;text-align:center;border-bottom:1px solid #f0fdf4;">Resolved</th>
          </tr>
          ${botRows || '<tr><td colspan="5" style="padding:16px;text-align:center;color:#9ca3af;font-size:13px;">No bot activity today</td></tr>'}
        </table>
      </td></tr>

      <!-- Pending escalations -->
      <tr><td style="background:white;padding:0 28px 28px;">
        <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#374151;">Pending Escalations${d.pendingEscalations.length ? ` <span style="background:#fef2f2;color:#dc2626;font-size:11px;padding:2px 7px;border-radius:20px;font-weight:700;">${d.pendingEscalations.length}</span>` : ''}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0fdf4;border-radius:10px;overflow:hidden;">
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#9ca3af;text-align:left;border-bottom:1px solid #f0fdf4;">Contact</th>
            <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#9ca3af;text-align:left;border-bottom:1px solid #f0fdf4;">Reason</th>
            <th style="padding:8px 12px;font-size:11px;font-weight:600;color:#9ca3af;text-align:left;border-bottom:1px solid #f0fdf4;">Waiting</th>
          </tr>
          ${escRows}
        </table>
      </td></tr>

      <!-- CTA -->
      <tr><td style="background:white;padding:0 28px 28px;text-align:center;">
        <a href="${d.dashboardUrl}" style="display:inline-block;background:#059669;color:white;font-size:13px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;">Open Dashboard</a>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f9fafb;border-top:1px solid #f0fdf4;border-radius:0 0 16px 16px;padding:16px 28px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#9ca3af;">Alphabot &nbsp;·&nbsp; You're receiving this because you're an admin of <strong>${d.tenantName}</strong></p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export async function runDailyReports(): Promise<void> {
  const db = getServerClient();
  const fromEmail = process.env['RESEND_FROM_EMAIL'] ?? 'onboarding@resend.dev';
  const dashboardUrl = process.env['WEB_BASE_URL'] ?? 'https://whats-app-agent-web.vercel.app';
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data: tenants } = await db.from('tenants').select('id, name').eq('status', 'active');
  if (!tenants?.length) return;

  for (const tenant of tenants) {
    try {
      // Fetch admin email via auth.admin
      const { data: adminUser } = await db
        .from('tenant_users')
        .select('user_id')
        .eq('tenant_id', tenant.id)
        .eq('role', 'admin')
        .limit(1)
        .single();

      let recipientEmail = fromEmail;
      if (adminUser?.user_id) {
        const { data: authData } = await db.auth.admin.getUserById(adminUser.user_id);
        if (authData?.user?.email) recipientEmail = authData.user.email;
      }

      // Parallel stats queries
      const [newRes, openRes, escalatedRes, resolvedRes, escRes, botRes] = await Promise.all([
        db.from('conversations').select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).gte('created_at', todayStart.toISOString()),
        db.from('conversations').select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).eq('status', 'open'),
        db.from('conversations').select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).eq('status', 'escalated'),
        db.from('conversations').select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id).eq('status', 'resolved')
          .gte('updated_at', todayStart.toISOString()),
        db.from('escalations')
          .select('id, trigger_reason, created_at, conversations(contacts(name, phone))')
          .eq('tenant_id', tenant.id)
          .in('status', ['pending', 'assigned'])
          .order('created_at', { ascending: true })
          .limit(10),
        db.from('conversations')
          .select('product_type, status, created_at')
          .eq('tenant_id', tenant.id),
      ]);

      // Compute per-bot stats
      const allConvs = botRes.data ?? [];
      const botTypes = ['support_bot', 'sales_bot', 'lifecycle_bot'];
      const bots: BotStat[] = botTypes.map(pt => {
        const convs = allConvs.filter(c => c.product_type === pt);
        return {
          product_type: pt,
          newToday: convs.filter(c => c.created_at >= todayStart.toISOString()).length,
          open: convs.filter(c => c.status === 'open').length,
          escalated: convs.filter(c => c.status === 'escalated').length,
          resolved: convs.filter(c => c.status === 'resolved').length,
        };
      }).filter(b => b.newToday + b.open + b.escalated + b.resolved > 0);

      // Pending escalations
      const pendingEscalations: PendingEscalation[] = (escRes.data ?? []).map(e => {
        const conv = e.conversations as unknown as { contacts: { name: string | null; phone: string } | null } | null;
        const contact = conv?.contacts?.name ?? conv?.contacts?.phone ?? 'Unknown';
        const ageMinutes = Math.floor((now.getTime() - new Date(e.created_at).getTime()) / 60000);
        return { id: e.id, contact, reason: e.trigger_reason, ageMinutes };
      });

      const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

      const html = buildHtml({
        tenantName: tenant.name,
        date: dateStr,
        newToday: newRes.count ?? 0,
        open: openRes.count ?? 0,
        escalated: escalatedRes.count ?? 0,
        resolvedToday: resolvedRes.count ?? 0,
        bots,
        pendingEscalations,
        dashboardUrl,
      });

      await resend.emails.send({
        from: fromEmail,
        to: [recipientEmail],
        subject: `Alphabot Daily Report — ${dateStr}`,
        html,
      });
    } catch (err) {
      console.error(`[DailyReport] Failed for tenant ${tenant.id}:`, err);
    }
  }
}
