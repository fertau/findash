import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { getRules } from '@/lib/db/categories';
import { categorizeBatch } from '@/lib/engine/categorizer';
import { getAdminDb, transactionsCollection } from '@/lib/firebase/admin';
import { nowISO } from '@/lib/utils';

interface Params {
  params: Promise<{ householdId: string }>;
}

const BATCH_SIZE = 500;

export async function POST(request: Request, { params }: Params) {
  try {
  const { householdId } = await params;
  await withHouseholdAuth(request, householdId, 'owner');

  const rules = await getRules(householdId);

  if (rules.length === 0) {
    return NextResponse.json({ updated: 0, categorized: 0, stillUncategorized: 0 });
  }

  const db = getAdminDb();
  const colRef = transactionsCollection(householdId);

  let updated = 0;
  let categorized = 0;
  let stillUncategorized = 0;
  let lastDocId: string | null = null;

  // Paginate through ALL transactions
  while (true) {
    let query = colRef.orderBy('__name__').limit(BATCH_SIZE);
    if (lastDocId) {
      query = query.startAfter(lastDocId);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    // Collect eligible transactions (non-manual)
    const eligible: { id: string; normalizedDescription: string; oldCategoryId: string }[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data.categoryMatchType !== 'manual') {
        eligible.push({
          id: doc.id,
          normalizedDescription: data.normalizedDescription ?? '',
          oldCategoryId: data.categoryId ?? '',
        });
      }
    }

    if (eligible.length > 0) {
      // Run batch categorization
      const descriptions = eligible.map((t) => t.normalizedDescription);
      const results = categorizeBatch(descriptions, rules);

      // Build batch writes for changed transactions
      let batch = db.batch();
      let batchCount = 0;
      const timestamp = nowISO();

      for (let i = 0; i < eligible.length; i++) {
        const txn = eligible[i];
        const result = results[i];

        // Only update if the category actually changed
        if (result.categoryId !== txn.oldCategoryId || result.matchType !== 'uncategorized') {
          if (result.categoryId === txn.oldCategoryId) continue;

          const docRef = colRef.doc(txn.id);
          batch.update(docRef, {
            categoryId: result.categoryId,
            categoryMatchType: result.matchType,
            updatedAt: timestamp,
          });
          batchCount++;
          updated++;

          if (result.matchType === 'uncategorized') {
            stillUncategorized++;
          } else {
            categorized++;
          }

          // Firestore batch limit
          if (batchCount >= BATCH_SIZE) {
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
          }
        } else if (result.matchType === 'uncategorized') {
          stillUncategorized++;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }
    }

    // Set cursor for next page
    lastDocId = snapshot.docs[snapshot.docs.length - 1].id;

    // If we got fewer than BATCH_SIZE, we've reached the end
    if (snapshot.size < BATCH_SIZE) break;
  }

  return NextResponse.json({ updated, categorized, stillUncategorized });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('Error applying categorization rules:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
