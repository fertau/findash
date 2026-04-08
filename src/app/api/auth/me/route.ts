import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/permissions';

/**
 * GET /api/auth/me
 * Returns the current authenticated user's profile.
 */
export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
