import { NextResponse } from 'next/server';
import { createSession, SESSION_COOKIE_NAME, SESSION_EXPIRY_MS } from '@/lib/auth/server-session';
import { getOrCreateUserProfile } from '@/lib/auth/session';
import { verifyToken } from '@/lib/auth/session';
import { getUserHouseholds } from '@/lib/db/households';

/**
 * POST /api/auth/session — Create a session cookie from a Firebase ID token
 */
export async function POST(request: Request) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: 'idToken required' }, { status: 400 });
    }

    // Verify the ID token first
    const decoded = await verifyToken(idToken);

    // Create or get user profile
    const profile = await getOrCreateUserProfile(
      decoded.uid,
      decoded.email || '',
      decoded.name || decoded.email?.split('@')[0]
    );

    // Create session cookie
    const sessionCookie = await createSession(idToken);

    // Get user's households
    const householdIds = await getUserHouseholds(profile.uid);

    // Set the cookie
    const response = NextResponse.json({
      user: {
        uid: profile.uid,
        email: profile.email,
        displayName: profile.displayName,
        householdIds,
      },
    });

    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_EXPIRY_MS / 1000,
      path: '/',
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Session creation failed';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * DELETE /api/auth/session — Clear the session cookie (logout)
 */
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
