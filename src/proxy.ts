import { NextResponse, type NextRequest } from 'next/server';

/**
 * Sunset proxy (2026-07-18). Supabase is paused, so auth/session refresh
 * and every data route would error. Redirect all traffic to the static
 * notice at "/". Static assets are excluded by the matcher.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/') return NextResponse.next();
  return NextResponse.redirect(new URL('/', request.url), 308);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next internals (static files, image optimization)
     * - favicon / icons / images / manifest / service worker
     */
    '/((?!_next/|favicon.ico|icons/|images/|manifest.json|sw.js|.*\\..*).*)',
  ],
};
