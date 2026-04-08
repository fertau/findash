import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Edge Middleware.
 *
 * Runs on the Edge Runtime — cannot use firebase-admin here.
 * Only performs lightweight checks:
 * 1. Checks Authorization header presence on /api/* routes
 * 2. Passes through to route handlers for full token verification
 *
 * Public endpoints (no auth required):
 * - /api/health
 */
const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/session',
  '/api/auth/login',
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply to API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Skip auth check for public endpoints
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Check for Authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  // Header present — pass through to route handler for full verification
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
