import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { getHousehold, updateHouseholdSettings } from '@/lib/db/households';

interface Params {
  params: Promise<{ householdId: string }>;
}

/**
 * GET /api/households/[householdId] — Get household details
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId);

    const household = await getHousehold(householdId);
    if (!household) {
      return NextResponse.json({ error: 'Household not found' }, { status: 404 });
    }

    return NextResponse.json({ household });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * PATCH /api/households/[householdId] — Update household settings
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId, 'owner');

    const body = await request.json();
    await updateHouseholdSettings(householdId, body.settings || {});

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
