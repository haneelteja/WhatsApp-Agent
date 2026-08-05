import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { EmailOtpType } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code      = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type      = searchParams.get('type') as EmailOtpType | null;
  const next      = searchParams.get('next') ?? '/';

  const supabase = await getSupabaseServerClient();

  if (code) {
    // PKCE flow — used by resetPasswordForEmail() sent from the app
    await supabase.auth.exchangeCodeForSession(code);
  } else if (tokenHash && type) {
    // Token-hash flow — used by Supabase dashboard "Send password recovery" button
    await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  }

  // Recovery emails must always land on the set-new-password page
  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/reset-password`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
