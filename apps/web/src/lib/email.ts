export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey   = process.env['RESEND_API_KEY'];
  const fromEmail = process.env['RESEND_FROM_EMAIL'] ?? process.env['BREVO_FROM_EMAIL'] ?? 'onboarding@resend.dev';

  if (!apiKey) {
    console.error('[email] RESEND_API_KEY is not set');
    return { ok: false, error: 'RESEND_API_KEY not set' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    `Alphabot <${fromEmail}>`,
      to:      [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[email] Resend error:', body);
    return { ok: false, error: body };
  }

  return { ok: true };
}
