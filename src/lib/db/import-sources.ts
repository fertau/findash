import { importSourcesCollection } from '@/lib/firebase/admin';
import { nowISO } from '@/lib/utils';
import type { ImportSource } from './types';

export async function getImportSources(householdId: string): Promise<ImportSource[]> {
  const snap = await importSourcesCollection(householdId)
    .orderBy('usageCount', 'desc')
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ImportSource);
}

export async function getImportSourceByFingerprint(
  householdId: string,
  fingerprintHash: string
): Promise<ImportSource | null> {
  const snap = await importSourcesCollection(householdId)
    .where('fingerprintHash', '==', fingerprintHash)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() } as ImportSource;
}

export async function createImportSource(
  householdId: string,
  data: Omit<ImportSource, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>
): Promise<ImportSource> {
  const now = nowISO();
  const record = {
    ...data,
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  const ref = await importSourcesCollection(householdId).add(record);
  return { id: ref.id, ...record };
}

export async function incrementSourceUsage(
  householdId: string,
  sourceId: string
): Promise<void> {
  const ref = importSourcesCollection(householdId).doc(sourceId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const current = snap.data()?.usageCount || 0;
  await ref.update({ usageCount: current + 1, updatedAt: nowISO() });
}

export async function updateImportSource(
  householdId: string,
  sourceId: string,
  updates: Partial<Pick<ImportSource, 'label' | 'institution' | 'documentType' | 'parserKey' | 'currencies'>>
): Promise<void> {
  await importSourcesCollection(householdId).doc(sourceId).update({
    ...updates,
    updatedAt: nowISO(),
  });
}

export async function deleteImportSource(
  householdId: string,
  sourceId: string
): Promise<void> {
  await importSourcesCollection(householdId).doc(sourceId).delete();
}
