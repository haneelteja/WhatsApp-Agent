import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env['BREVO_API_KEY'];
  const fromEmail = process.env['BREVO_FROM_EMAIL'] ?? 'pega2023test@gmail.com';
  const toEmail = 'pega2023test@gmail.com';

  if (!apiKey) {
    return NextResponse.json({ error: 'BREVO_API_KEY is not set' }, { status: 500 });
  }

  const payload = {
    sender:      { name: 'Alphabot', email: fromEmail },
    to:          [{ email: toEmail }],
    subject:     'Alphabot — Email debug test',
    htmlContent: '<p>This is a test email from Alphabot debug endpoint.</p>',
  };

  let brevoStatus: number | null = null;
  let brevoBody: string | null = null;

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method:  'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    brevoStatus = res.status;
    brevoBody   = await res.text();
  } catch (err) {
    return NextResponse.json({
      error:        'fetch threw an exception',
      detail:       String(err),
      apiKeyPrefix: apiKey.slice(0, 12) + '…',
      fromEmail,
    }, { status: 500 });
  }

  return NextResponse.json({
    brevoStatus,
    brevoBody,
    apiKeyPrefix: apiKey.slice(0, 12) + '…',
    fromEmail,
    toEmail,
  });
}
