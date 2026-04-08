import { importLogCollection } from '@/lib/firebase/admin';
import { nowISO } from '@/lib/utils';
import type { ImportBatch, ImportStatus } from './types';

export async function createImportBatch(
  householdId: string,
  data: {
    fileName: string;
    fileHash: string;
    sourceId: string;
    period?: string;
    importedBy: string;
  }
): Promise<ImportBatch> {
  const now = nowISO();
  const batch: Omit<ImportBatch, 'id'> = {
    ...data,
    transactionCount: 0,
    duplicatesSkipped: 0,
    status: 'processing',
    importedAt: now,
  };
  const ref = await importLogCollection(householdId).add(batch);
  return { id: ref.id, ...batch };
}

export async function updateImportBatch(
  householdId: string,
  batchId: string,
  updates: {
    status: ImportStatus;
    transactionCount?: number;
    duplicatesSkipped?: number;
    notes?: string;
    period?: string;
  }
): Promise<void> {
  await importLogCollection(householdId).doc(batchId).update(updates);
}

export async function getImportBatch(
  householdId: string,
  batchId: string
): Promise<ImportBatch | null> {
  const snap = await importLogCollection(householdId).doc(batchId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as ImportBatch;
}

export async function findImportByHash(
  householdId: string,
  fileHash: string
): Promise<ImportBatch | null> {
  const snap = await importLogCollection(householdId)
    .where('fileHash', '==', fileHash)
    .where('status', '==', 'success')
    .limit(1)
    .get();

  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as ImportBatch;
}

export async function getImportHistory(
  householdId: string,
  page = 1,
  limit = 20
): Promise<{ items: ImportBatch[]; total: number }> {
  const countSnap = await importLogCollection(householdId).count().get();
  const total = countSnap.data().count;

  const offset = (page - 1) * limit;
  const snap = await importLogCollection(householdId)
    .orderBy('importedAt', 'desc')
    .offset(offset)
    .limit(limit)
    .get();

  const items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ImportBatch);
  return { items, total };
}
