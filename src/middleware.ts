import { NextResponse, type NextRequest } from 'next/server';

/**
 * Sunset middleware (2026-07-18). Supabase is paused, so any route that
 * touches auth or data would error. Redirect everything to the static
 * notice at "/" except Next internals and public assets.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/') return NextResponse.next();
  return NextResponse.redirect(new URL('/', request.url), 308);
}

export const config = {
  matcher: [
    // Everything except: Next internals, favicon, and static files (dot in name)
    '/((?!_next/|favicon\\.ico|.*\\..*).*)',
  ],
};
