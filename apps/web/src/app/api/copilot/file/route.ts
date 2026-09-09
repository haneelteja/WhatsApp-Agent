import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });

  const form = await request.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const maxBytes = 5 * 1024 * 1024; // 5 MB
  if (file.size > maxBytes) return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 400 });

  const mimeType = file.type;
  const buffer = Buffer.from(await file.arrayBuffer());

  if (mimeType === 'application/pdf') {
    const base64 = buffer.toString('base64');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            {
              type: 'text',
              text: 'Extract all the text content from this document. Return the full raw text as-is, preserving any question-answer structure or FAQ format you find. Do not summarise — return all the content.',
            },
          ],
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Extraction failed: ${err}` }, { status: 500 });
    }

    const data = await res.json() as { content: Array<{ type: string; text?: string }> };
    const text = data.content.find(b => b.type === 'text')?.text ?? '';
    return NextResponse.json({ text, filename: file.name });
  }

  // Plain text files (txt, csv, md, json, etc.)
  const text = buffer.toString('utf-8');
  return NextResponse.json({ text, filename: file.name });
}
