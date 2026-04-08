import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { transactionsCollection, allocationsCollection } from '@/lib/firebase/admin';
import { getCategories } from '@/lib/db/categories';
import type { Transaction, TransferAllocation } from '@/lib/db/types';

interface Params {
  params: Promise<{ householdId: string; userId: string }>;
}

/**
 * GET /api/households/[householdId]/members/[userId]/spending
 * Member spending summary: direct card expenses + allocated transfers.
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { householdId, userId } = await params;
    await withHouseholdAuth(request, householdId);

    const url = new URL(request.url);
    const period = url.searchParams.get('period') || getCurrentPeriod();

    // Get direct transactions for this member
    const directSnap = await transactionsCollection(householdId)
      .where('memberId', '==', userId)
      .where('period', '==', period)
      .where('isExcluded', '==', false)
      .get();

    const directTxs = directSnap.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as Transaction
    );

    // Get allocations for transfers to this member
    const allocSnap = await allocationsCollection(householdId).get();
    const allAllocations = allocSnap.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as TransferAllocation
    );

    // Filter allocations for transfers in this period
    const transferIds = directTxs
      .filter((tx) =>
        tx.normalizedDescription.includes('TRANSFER') ||
        tx.categoryId === 'cat_transferencias'
      )
      .map((tx) => tx.id);

    const memberAllocations = allAllocations.filter((a) =>
      transferIds.includes(a.transferTransactionId)
    );

    // Non-transfer direct expenses
    const directExpenses = directTxs.filter(
      (tx) =>
        !tx.normalizedDescription.includes('TRANSFER') &&
        tx.categoryId !== 'cat_transferencias'
    );

    // Sum by category
    const categories = await getCategories(householdId);
    const catMap = new Map(categories.map((c) => [c.id, c]));

    const byCategoryMap = new Map<string, { direct: number; allocated: number }>();

    for (const tx of directExpenses) {
      const entry = byCategoryMap.get(tx.categoryId) || { direct: 0, allocated: 0 };
      entry.direct += tx.amount;
      byCategoryMap.set(tx.categoryId, entry);
    }

    for (const alloc of memberAllocations) {
      const entry = byCategoryMap.get(alloc.categoryId) || { direct: 0, allocated: 0 };
      entry.allocated += alloc.amount;
      byCategoryMap.set(alloc.categoryId, entry);
    }

    const byCategory = Array.from(byCategoryMap.entries()).map(([catId, data]) => ({
      categoryId: catId,
      name: catMap.get(catId)?.name || 'Unknown',
      directAmount: Math.round(data.direct * 100) / 100,
      allocatedAmount: Math.round(data.allocated * 100) / 100,
      totalAmount: Math.round((data.direct + data.allocated) * 100) / 100,
    }));

    const totalDirect = directExpenses.reduce((sum, tx) => sum + tx.amount, 0);
    const totalAllocated = memberAllocations.reduce((sum, a) => sum + a.amount, 0);

    return NextResponse.json({
      period,
      memberId: userId,
      directExpenses: Math.round(totalDirect * 100) / 100,
      allocatedExpenses: Math.round(totalAllocated * 100) / 100,
      totalExpenses: Math.round((totalDirect + totalAllocated) * 100) / 100,
      transactionCount: directExpenses.length,
      allocationCount: memberAllocations.length,
      byCategory,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
