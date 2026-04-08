import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { transactionsCollection } from '@/lib/firebase/admin';
import type { Transaction } from '@/lib/db/types';

interface Params {
  params: Promise<{ householdId: string }>;
}

/**
 * GET /api/households/[householdId]/installments — Grouped installment series
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId);

    // Get all transactions that have installment info
    const snap = await transactionsCollection(householdId)
      .where('isExcluded', '==', false)
      .get();

    const allTxs = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as Transaction)
      .filter((tx) => tx.installment);

    // Group by installment groupId
    const groups = new Map<string, Transaction[]>();
    for (const tx of allTxs) {
      const groupId = tx.installment!.groupId;
      const list = groups.get(groupId) || [];
      list.push(tx);
      groups.set(groupId, list);
    }

    const installmentGroups = Array.from(groups.entries()).map(([groupId, txs]) => {
      const sorted = txs.sort((a, b) => a.installment!.current - b.installment!.current);
      const first = sorted[0];

      return {
        groupId,
        description: first.description.replace(/\d+\s*\/\s*\d+/, '').trim(),
        currency: first.currency,
        installmentAmount: first.amount,
        totalInstallments: first.installment!.total,
        paidInstallments: sorted.length,
        totalAmount: first.amount * first.installment!.total,
        categoryId: first.categoryId,
        transactions: sorted.map((tx) => ({
          id: tx.id,
          date: tx.date,
          installment: `${tx.installment!.current}/${tx.installment!.total}`,
          amount: tx.amount,
        })),
      };
    });

    return NextResponse.json({ installmentGroups });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
