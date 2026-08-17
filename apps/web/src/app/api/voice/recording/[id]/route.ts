import type { NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const API_BASE = process.env['API_BASE_URL'] ?? 'https://whatsapp-agent-fmtg.onrender.com';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Require an active session — recordings are private
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;

  const upstream = await fetch(`${API_BASE}/api/voice/recording/${id}`, {
    signal: AbortSignal.timeout(20_000),
  });

  if (!upstream.ok) {
    return new Response('Recording not available', { status: upstream.status });
  }

  const audio = await upstream.arrayBuffer();
  return new Response(audio, {
    headers: {
      'Content-Type':  'audio/mpeg',
      'Cache-Control': 'private, max-age=3600',
      'Content-Length': String(audio.byteLength),
    },
  });
}
