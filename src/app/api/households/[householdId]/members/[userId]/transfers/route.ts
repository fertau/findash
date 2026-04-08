import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { transactionsCollection } from '@/lib/firebase/admin';
import { allocationsCollection } from '@/lib/firebase/admin';
import type { Transaction, TransferAllocation } from '@/lib/db/types';

interface Params {
  params: Promise<{ householdId: string; userId: string }>;
}

/**
 * GET /api/households/[householdId]/members/[userId]/transfers
 * List transfers to a member that can be allocated to categories.
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { householdId, userId } = await params;
    await withHouseholdAuth(request, householdId);

    // Find transfer transactions attributed to this member
    // These are bank transfers (source_type = account) to the member
    const snap = await transactionsCollection(householdId)
      .where('memberId', '==', userId)
      .where('isExcluded', '==', false)
      .get();

    // Filter for transfer-like transactions
    const transfers = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as Transaction)
      .filter((tx) =>
        tx.normalizedDescription.includes('TRANSFER') ||
        tx.normalizedDescription.includes('ENVIO') ||
        tx.categoryId === 'cat_transferencias'
      );

    // Check which have allocations
    const allocSnap = await allocationsCollection(householdId).get();
    const allocatedTxIds = new Set(
      allocSnap.docs.map((doc) => doc.data().transferTransactionId)
    );

    const items = transfers.map((tx) => ({
      id: tx.id,
      date: tx.date,
      amount: tx.amount,
      currency: tx.currency,
      description: tx.description,
      allocated: allocatedTxIds.has(tx.id),
    }));

    return NextResponse.json({ transfers: items });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
