import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Dashboard routes that require an authenticated session.
// Next.js route groups (e.g. (dashboard)/) don't affect the URL path.
const PROTECTED_PREFIXES = [
  '/analytics',
  '/billing',
  '/campaigns',
  '/conversations',
  '/escalations',
  '/follow-ups',
  '/guardrails',
  '/knowledge-base',
  '/orders',
  '/settings',
  '/team',
  '/voice',
  '/ai-models',
  '/platform',
];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session cookie AND retrieve the user for the auth guard below.
  // Do not remove this await — required by @supabase/ssr.
  const { data: { user } } = await supabase.auth.getUser();

  // Redirect unauthenticated users away from protected routes at the edge,
  // before any Server Component renders. Saves one full server round-trip per
  // page visit compared to delegating the redirect to individual page files.
  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix));

  if (!user && isProtected) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
