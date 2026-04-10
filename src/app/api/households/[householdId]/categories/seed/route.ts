import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { getCategories } from '@/lib/db/categories';
import { seedDefaultData } from '@/lib/db/households';

interface Params {
  params: Promise<{ householdId: string }>;
}

/**
 * POST /api/households/[householdId]/categories/seed
 * Seed default categories if none exist (or force re-seed with ?force=1)
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    const { user } = await withHouseholdAuth(request, householdId, 'owner');

    const url = new URL(request.url);
    const force = url.searchParams.get('force') === '1';

    // Check if categories already exist
    const existing = await getCategories(householdId);
    if (existing.length > 0 && !force) {
      return NextResponse.json({
        seeded: false,
        message: `Ya existen ${existing.length} categorías. Usá ?force=1 para re-seedear.`,
        count: existing.length,
      });
    }

    await seedDefaultData(householdId, user.uid);

    const after = await getCategories(householdId);
    return NextResponse.json({
      seeded: true,
      count: after.length,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('Error seeding categories:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
