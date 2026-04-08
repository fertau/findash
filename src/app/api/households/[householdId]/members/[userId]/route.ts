import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { updateMember, getMember } from '@/lib/db/households';
import { UpdateMemberSchema } from '@/lib/db/schemas';

interface Params {
  params: Promise<{ householdId: string; userId: string }>;
}

/**
 * GET /api/households/[householdId]/members/[userId]
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { householdId, userId } = await params;
    await withHouseholdAuth(request, householdId);

    const member = await getMember(householdId, userId);
    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    return NextResponse.json({ member });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * PATCH /api/households/[householdId]/members/[userId] — Update member
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { householdId, userId } = await params;
    await withHouseholdAuth(request, householdId, 'owner');

    const body = await request.json();
    const data = UpdateMemberSchema.parse(body);

    await updateMember(householdId, userId, data);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : 'Failed to update member';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
