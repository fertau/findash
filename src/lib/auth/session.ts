import { getAdminAuth } from '@/lib/firebase/admin';
import { usersCollection } from '@/lib/firebase/admin';
import type { UserProfile } from '@/lib/db/types';
import type { DecodedIdToken } from 'firebase-admin/auth';

/**
 * Verify a Firebase ID token and return the decoded claims.
 */
export async function verifyToken(token: string): Promise<DecodedIdToken> {
  return getAdminAuth().verifyIdToken(token);
}

/**
 * Get or create a user profile in Firestore.
 */
export async function getOrCreateUserProfile(
  uid: string,
  email: string,
  displayName?: string
): Promise<UserProfile> {
  const ref = usersCollection().doc(uid);
  const snap = await ref.get();

  if (snap.exists) {
    return { uid, ...snap.data() } as UserProfile;
  }

  const profile: Omit<UserProfile, 'uid'> = {
    email,
    displayName: displayName || email.split('@')[0],
    householdIds: [],
    createdAt: new Date().toISOString(),
  };

  await ref.set(profile);
  return { uid, ...profile };
}

/**
 * Get a user profile by UID.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await usersCollection().doc(uid).get();
  if (!snap.exists) return null;
  return { uid, ...snap.data() } as UserProfile;
}
