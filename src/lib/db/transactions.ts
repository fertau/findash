import { transactionsCollection, getAdminDb } from '@/lib/firebase/admin';
import { nowISO } from '@/lib/utils';
import type { Transaction } from './types';

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createTransaction(
  householdId: string,
  data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Transaction> {
  const now = nowISO();
  const ref = await transactionsCollection(householdId).add({
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  return { id: ref.id, ...data, createdAt: now, updatedAt: now };
}

/**
 * Batch create transactions. Chunks into groups of 400 to stay within
 * Firestore's 500-operation batch limit (leaving room for metadata ops).
 */
export async function batchCreateTransactions(
  householdId: string,
  transactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>[]
): Promise<string[]> {
  const db = getAdminDb();
  const now = nowISO();
  const ids: string[] = [];
  const CHUNK_SIZE = 400;

  for (let i = 0; i < transactions.length; i += CHUNK_SIZE) {
    const chunk = transactions.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();

    for (const tx of chunk) {
      const ref = transactionsCollection(householdId).doc();
      // Strip undefined values — Firestore rejects them
      const clean = Object.fromEntries(
        Object.entries({ ...tx, createdAt: now, updatedAt: now }).filter(([, v]) => v !== undefined)
      );
      batch.set(ref, clean);
      ids.push(ref.id);
    }

    await batch.commit();
  }

  return ids;
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function getTransaction(
  householdId: string,
  txId: string
): Promise<Transaction | null> {
  const snap = await transactionsCollection(householdId).doc(txId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as Transaction;
}

export interface ListTransactionsFilters {
  dateFrom?: string;
  dateTo?: string;
  period?: string;
  categoryId?: string;
  memberId?: string;
  sourceId?: string;
  currency?: string;
  isExcluded?: boolean;
  isExtraordinary?: boolean;
  page: number;
  limit: number;
}

export async function listTransactions(
  householdId: string,
  filters: ListTransactionsFilters
): Promise<{ items: Transaction[]; total: number }> {
  let query = transactionsCollection(householdId)
    .orderBy('date', 'desc') as FirebaseFirestore.Query;

  if (filters.period) {
    query = query.where('period', '==', filters.period);
  }
  if (filters.dateFrom) {
    query = query.where('date', '>=', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.where('date', '<=', filters.dateTo);
  }
  if (filters.categoryId) {
    query = query.where('categoryId', '==', filters.categoryId);
  }
  if (filters.memberId) {
    query = query.where('memberId', '==', filters.memberId);
  }
  if (filters.sourceId) {
    query = query.where('sourceId', '==', filters.sourceId);
  }
  if (filters.currency) {
    query = query.where('currency', '==', filters.currency);
  }
  if (filters.isExcluded !== undefined) {
    query = query.where('isExcluded', '==', filters.isExcluded);
  }
  if (filters.isExtraordinary !== undefined) {
    query = query.where('isExtraordinary', '==', filters.isExtraordinary);
  }

  // For total count, we need a separate query (Firestore doesn't support COUNT with filters efficiently)
  // In production, consider using a counter document or aggregation queries
  const countSnap = await query.count().get();
  const total = countSnap.data().count;

  // Pagination
  const offset = (filters.page - 1) * filters.limit;
  const snap = await query.offset(offset).limit(filters.limit).get();

  const items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Transaction);
  return { items, total };
}

export async function findByHash(
  householdId: string,
  hash: string
): Promise<Transaction | null> {
  const snap = await transactionsCollection(householdId)
    .where('hash', '==', hash)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Transaction;
}

export async function getTransactionsByImportBatch(
  householdId: string,
  importBatchId: string
): Promise<Transaction[]> {
  const snap = await transactionsCollection(householdId)
    .where('importBatchId', '==', importBatchId)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Transaction);
}

/**
 * Get transactions for dashboard aggregation.
 * Returns non-excluded transactions for a given period.
 */
export async function getTransactionsForDashboard(
  householdId: string,
  period: string
): Promise<Transaction[]> {
  const snap = await transactionsCollection(householdId)
    .where('period', '==', period)
    .where('isExcluded', '==', false)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Transaction);
}

/**
 * Get transactions across multiple periods (for monthly trend).
 */
export async function getTransactionsForPeriods(
  householdId: string,
  periods: string[]
): Promise<Transaction[]> {
  // Firestore 'in' query supports up to 30 values
  const snap = await transactionsCollection(householdId)
    .where('period', 'in', periods)
    .where('isExcluded', '==', false)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Transaction);
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateTransaction(
  householdId: string,
  txId: string,
  updates: Partial<Transaction>
): Promise<void> {
  await transactionsCollection(householdId).doc(txId).update({
    ...updates,
    updatedAt: nowISO(),
  });
}

// ─── Delete (soft) ───────────────────────────────────────────────────────────

export async function softDeleteTransaction(
  householdId: string,
  txId: string
): Promise<void> {
  await transactionsCollection(householdId).doc(txId).update({
    isExcluded: true,
    exclusionReason: 'Deleted by user',
    updatedAt: nowISO(),
  });
}
