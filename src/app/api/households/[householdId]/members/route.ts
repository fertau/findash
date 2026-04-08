import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { getMembers, addMember } from '@/lib/db/households';
import { getOrCreateUserProfile } from '@/lib/auth/session';
import { getAdminAuth } from '@/lib/firebase/admin';
import { InviteMemberSchema } from '@/lib/db/schemas';
import { nowISO } from '@/lib/utils';
import type { HouseholdMember } from '@/lib/db/types';

interface Params {
  params: Promise<{ householdId: string }>;
}

/**
 * GET /api/households/[householdId]/members — List members
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId);

    const members = await getMembers(householdId);
    return NextResponse.json({ members });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * POST /api/households/[householdId]/members — Invite a member
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId, 'owner');

    const body = await request.json();
    const data = InviteMemberSchema.parse(body);

    // Look up or create Firebase user by email
    let uid: string;
    try {
      const fbUser = await getAdminAuth().getUserByEmail(data.email);
      uid = fbUser.uid;
    } catch {
      // User doesn't exist in Firebase Auth yet — create a placeholder profile
      // They'll be able to sign up later and claim their membership
      const created = await getAdminAuth().createUser({ email: data.email });
      uid = created.uid;
    }

    const profile = await getOrCreateUserProfile(uid, data.email, data.displayName);

    const member: HouseholdMember = {
      userId: uid,
      email: data.email,
      displayName: profile.displayName,
      role: data.role || 'member',
      isExcluded: false,
      canUpload: true,
      canViewAll: false,
      joinedAt: nowISO(),
    };

    await addMember(householdId, member);

    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : 'Failed to invite member';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
