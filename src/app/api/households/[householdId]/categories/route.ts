import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { getCategoryTree, createCategory } from '@/lib/db/categories';
import { CreateCategorySchema } from '@/lib/db/schemas';

interface Params {
  params: Promise<{ householdId: string }>;
}

/**
 * GET /api/households/[householdId]/categories — Category tree
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId);

    const tree = await getCategoryTree(householdId);
    return NextResponse.json({ categories: tree });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * POST /api/households/[householdId]/categories — Create category
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId, 'owner');

    const body = await request.json();
    const data = CreateCategorySchema.parse(body);

    const category = await createCategory(householdId, {
      ...data,
      isSystem: false,
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : 'Failed to create category';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
