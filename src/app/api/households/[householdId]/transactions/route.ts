import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { listTransactions, createTransaction } from '@/lib/db/transactions';
import { ListTransactionsQuerySchema, CreateTransactionSchema } from '@/lib/db/schemas';
import { normalizeDescription, computeTransactionHash, dateToPeriod, nowISO } from '@/lib/utils';

interface Params {
  params: Promise<{ householdId: string }>;
}

/**
 * GET /api/households/[householdId]/transactions — List transactions
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    const { member } = await withHouseholdAuth(request, householdId);

    const url = new URL(request.url);
    const query = ListTransactionsQuerySchema.parse(Object.fromEntries(url.searchParams));

    // Members who can't view all only see their own transactions
    const filters = {
      ...query,
      isExcluded: query.isExcluded ? query.isExcluded === 'true' : undefined,
      isExtraordinary: query.isExtraordinary ? query.isExtraordinary === 'true' : undefined,
      memberId: member.canViewAll ? query.memberId : member.userId,
    };

    const result = await listTransactions(householdId, filters);

    return NextResponse.json({
      items: result.items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : 'Failed to list transactions';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * POST /api/households/[householdId]/transactions — Create manual transaction
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    const { user } = await withHouseholdAuth(request, householdId);

    const body = await request.json();
    const data = CreateTransactionSchema.parse(body);

    const normalized = normalizeDescription(data.description);
    const hash = computeTransactionHash(
      data.date,
      data.description,
      data.amount,
      data.currency,
      data.sourceId
    );

    const tx = await createTransaction(householdId, {
      householdId,
      date: data.date,
      period: dateToPeriod(data.date),
      description: data.description,
      normalizedDescription: normalized,
      amount: data.amount,
      currency: data.currency,
      categoryId: data.categoryId || 'cat_sin_categorizar',
      categoryMatchType: data.categoryId ? 'manual' : 'uncategorized',
      sourceId: data.sourceId,
      memberId: data.memberId,
      isExcluded: false,
      isExtraordinary: data.isExtraordinary,
      extraordinaryNote: data.extraordinaryNote,
      importBatchId: 'manual',
      hash,
    });

    return NextResponse.json({ transaction: tx }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : 'Failed to create transaction';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
