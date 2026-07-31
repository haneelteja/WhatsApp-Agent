import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

export async function GET() {
  const apiKey = process.env['RESEND_API_KEY'];

  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not set' }, { status: 500 });
  }

  const result = await sendEmail({
    to:      'pega2023test@gmail.com',
    subject: 'Alphabot — Email debug test',
    html:    '<p>This is a test email from Alphabot. Email is working correctly.</p>',
  });

  return NextResponse.json({
    ...result,
    apiKeyPrefix: apiKey.slice(0, 8) + '…',
    provider: 'Resend',
  });
}
