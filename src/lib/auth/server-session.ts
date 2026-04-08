import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAdminAuth } from '@/lib/firebase/admin';
import { getUserProfile, getOrCreateUserProfile } from './session';
import type { UserProfile } from '@/lib/db/types';

const SESSION_COOKIE_NAME = '__session';
const SESSION_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * Get the authenticated user from the session cookie.
 * For use in Server Components. Redirects to /login if not authenticated.
 */
export async function getServerUser(): Promise<UserProfile> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    redirect('/login');
  }

  try {
    const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
    const profile = await getUserProfile(decoded.uid);

    if (!profile) {
      redirect('/login');
    }

    return profile;
  } catch {
    redirect('/login');
  }
}

/**
 * Create a session cookie from a Firebase ID token.
 * Called by the /api/auth/session endpoint.
 */
export async function createSession(idToken: string): Promise<string> {
  const sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_EXPIRY_MS,
  });
  return sessionCookie;
}

/**
 * Clear the session cookie.
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export { SESSION_COOKIE_NAME, SESSION_EXPIRY_MS };
