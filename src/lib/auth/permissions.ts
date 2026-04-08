import { NextResponse } from 'next/server';
import { verifyToken, getUserProfile } from './session';
import { getMember } from '@/lib/db/households';
import type { UserProfile, HouseholdMember, MemberRole } from '@/lib/db/types';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  displayName: string;
  householdIds: string[];
}

/**
 * Extract and verify the Bearer token from a request.
 * Returns the authenticated user or throws an error response.
 */
export async function getAuthenticatedUser(
  request: Request
): Promise<AuthenticatedUser> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    throw NextResponse.json(
      { error: 'Missing or invalid Authorization header' },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);

  try {
    const decoded = await verifyToken(token);
    const profile = await getUserProfile(decoded.uid);

    if (!profile) {
      throw NextResponse.json(
        { error: 'User profile not found' },
        { status: 401 }
      );
    }

    return {
      uid: profile.uid,
      email: profile.email,
      displayName: profile.displayName,
      householdIds: profile.householdIds,
    };
  } catch (err) {
    if (err instanceof NextResponse) throw err;
    throw NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 }
    );
  }
}

/**
 * Assert that a user is a member of a household.
 * Throws 403 if not.
 */
export async function assertHouseholdAccess(
  userId: string,
  householdId: string
): Promise<HouseholdMember> {
  const member = await getMember(householdId, userId);

  if (!member) {
    throw NextResponse.json(
      { error: 'You do not have access to this household' },
      { status: 403 }
    );
  }

  return member;
}

/**
 * Assert that a user is the owner of a household.
 * Throws 403 if not.
 */
export async function assertHouseholdOwner(
  userId: string,
  householdId: string
): Promise<HouseholdMember> {
  const member = await assertHouseholdAccess(userId, householdId);

  if (member.role !== 'owner') {
    throw NextResponse.json(
      { error: 'Only the household owner can perform this action' },
      { status: 403 }
    );
  }

  return member;
}

/**
 * Helper to wrap route handlers with auth + household access check.
 */
export async function withHouseholdAuth(
  request: Request,
  householdId: string,
  requiredRole?: MemberRole
): Promise<{ user: AuthenticatedUser; member: HouseholdMember }> {
  const user = await getAuthenticatedUser(request);

  const member = requiredRole === 'owner'
    ? await assertHouseholdOwner(user.uid, householdId)
    : await assertHouseholdAccess(user.uid, householdId);

  return { user, member };
}
