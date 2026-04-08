import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { getImportHistory } from '@/lib/db/import-log';

interface Params {
  params: Promise<{ householdId: string }>;
}

/**
 * GET /api/households/[householdId]/import/history — Import log
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId);

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    const result = await getImportHistory(householdId, page, limit);

    return NextResponse.json({
      items: result.items,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
