import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { allocationsCollection, getAdminDb } from '@/lib/firebase/admin';
import { getTransaction } from '@/lib/db/transactions';
import { CreateAllocationsSchema } from '@/lib/db/schemas';
import { nowISO } from '@/lib/utils';

interface Params {
  params: Promise<{ householdId: string; userId: string; txId: string }>;
}

/**
 * GET — List allocations for a specific transfer
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { householdId, txId } = await params;
    await withHouseholdAuth(request, householdId);

    const snap = await allocationsCollection(householdId)
      .where('transferTransactionId', '==', txId)
      .get();

    const allocations = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ allocations });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * POST — Allocate a transfer to categories
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { householdId, txId } = await params;
    const { user } = await withHouseholdAuth(request, householdId);

    // Verify the transaction exists
    const tx = await getTransaction(householdId, txId);
    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const body = await request.json();
    const data = CreateAllocationsSchema.parse(body);

    // Validate total doesn't exceed transfer amount
    const allocTotal = data.allocations.reduce((sum, a) => sum + a.amount, 0);
    if (allocTotal > tx.amount * 1.01) { // 1% tolerance for rounding
      return NextResponse.json(
        { error: `Allocation total (${allocTotal}) exceeds transfer amount (${tx.amount})` },
        { status: 400 }
      );
    }

    // Delete existing allocations and create new ones
    const db = getAdminDb();
    const batch = db.batch();
    const now = nowISO();

    // Remove old allocations
    const existing = await allocationsCollection(householdId)
      .where('transferTransactionId', '==', txId)
      .get();
    for (const doc of existing.docs) {
      batch.delete(doc.ref);
    }

    // Create new allocations
    const ids: string[] = [];
    for (const alloc of data.allocations) {
      const ref = allocationsCollection(householdId).doc();
      batch.set(ref, {
        transferTransactionId: txId,
        categoryId: alloc.categoryId,
        amount: alloc.amount,
        currency: tx.currency,
        note: alloc.note || null,
        createdBy: user.uid,
        createdAt: now,
      });
      ids.push(ref.id);
    }

    await batch.commit();

    return NextResponse.json({ allocationIds: ids }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : 'Failed to create allocations';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
