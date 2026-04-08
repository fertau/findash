import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { getTransaction, updateTransaction, softDeleteTransaction } from '@/lib/db/transactions';
import { UpdateTransactionSchema } from '@/lib/db/schemas';

interface Params {
  params: Promise<{ householdId: string; txId: string }>;
}

/**
 * GET /api/households/[householdId]/transactions/[txId]
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { householdId, txId } = await params;
    await withHouseholdAuth(request, householdId);

    const tx = await getTransaction(householdId, txId);
    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    return NextResponse.json({ transaction: tx });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * PATCH /api/households/[householdId]/transactions/[txId] — Update
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { householdId, txId } = await params;
    await withHouseholdAuth(request, householdId);

    const body = await request.json();
    const data = UpdateTransactionSchema.parse(body);

    // If category is being manually set, update matchType
    const updates: Record<string, unknown> = { ...data };
    if (data.categoryId) {
      updates.categoryMatchType = 'manual';
    }

    await updateTransaction(householdId, txId, updates);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : 'Failed to update';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/households/[householdId]/transactions/[txId] — Soft delete
 */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { householdId, txId } = await params;
    await withHouseholdAuth(request, householdId, 'owner');

    await softDeleteTransaction(householdId, txId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
