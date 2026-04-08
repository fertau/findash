import { NextResponse } from 'next/server';
import { verifyToken, getOrCreateUserProfile } from '@/lib/auth/session';
import { getUserHouseholds } from '@/lib/db/households';

/**
 * POST /api/auth/login
 * Exchange a Firebase ID token for a user profile.
 * Creates the user profile in Firestore if it doesn't exist.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken } = body;

    if (!idToken || typeof idToken !== 'string') {
      return NextResponse.json(
        { error: 'idToken is required' },
        { status: 400 }
      );
    }

    const decoded = await verifyToken(idToken);
    const profile = await getOrCreateUserProfile(
      decoded.uid,
      decoded.email || '',
      decoded.name || decoded.email?.split('@')[0]
    );

    const householdIds = await getUserHouseholds(profile.uid);

    return NextResponse.json({
      user: {
        uid: profile.uid,
        email: profile.email,
        displayName: profile.displayName,
        householdIds,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
