import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/permissions';
import { createHousehold, getHousehold } from '@/lib/db/households';
import { CreateHouseholdSchema } from '@/lib/db/schemas';

/**
 * POST /api/households — Create a new household
 */
export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const body = await request.json();
    const data = CreateHouseholdSchema.parse(body);

    const household = await createHousehold(
      user.uid,
      user.email,
      user.displayName,
      data.name,
      data.baseCurrency
    );

    return NextResponse.json({ household }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : 'Failed to create household';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
