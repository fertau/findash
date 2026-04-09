import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { getCategories } from '@/lib/db/categories';
import { getAdminDb, transactionsCollection } from '@/lib/firebase/admin';
import { isAICategorizationAvailable, aiCategorizeBatch } from '@/lib/engine/ai-categorizer';
import { nowISO } from '@/lib/utils';
import type { AICategorizeInput } from '@/lib/engine/ai-categorizer';

interface Params {
  params: Promise<{ householdId: string }>;
}

const PAGE_SIZE = 500;

export async function POST(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId, 'owner');

    const body = await request.json().catch(() => ({}));
    const scope: 'uncategorized' | 'all-auto' = body.scope === 'all-auto' ? 'all-auto' : 'uncategorized';

    // Check AI availability before doing any work
    if (!isAICategorizationAvailable()) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured' },
        { status: 400 },
      );
    }

    const categories = await getCategories(householdId);

    const db = getAdminDb();
    const colRef = transactionsCollection(householdId);

    // Collect all eligible transactions via pagination
    const eligible: { id: string; input: AICategorizeInput; oldCategoryId: string }[] = [];
    let lastDocId: string | null = null;

    while (true) {
      let query = colRef.orderBy('__name__').limit(PAGE_SIZE);
      if (lastDocId) {
        query = query.startAfter(lastDocId);
      }

      const snapshot = await query.get();
      if (snapshot.empty) break;

      for (const doc of snapshot.docs) {
        const data = doc.data();

        const isEligible =
          scope === 'uncategorized'
            ? data.categoryId === 'cat_sin_categorizar'
            : data.categoryMatchType !== 'manual';

        if (isEligible) {
          eligible.push({
            id: doc.id,
            input: {
              description: data.description ?? '',
              normalizedDescription: data.normalizedDescription ?? '',
              amount: data.amount ?? 0,
              currency: data.currency ?? '',
            },
            oldCategoryId: data.categoryId ?? '',
          });
        }
      }

      lastDocId = snapshot.docs[snapshot.docs.length - 1].id;
      if (snapshot.size < PAGE_SIZE) break;
    }

    if (eligible.length === 0) {
      return NextResponse.json({ processed: 0, categorized: 0, skippedLowConfidence: 0 });
    }

    // Run AI categorization (aiCategorizeBatch handles internal batching of 50)
    const inputs = eligible.map((t) => t.input);
    const results = await aiCategorizeBatch(inputs, categories);

    // Write updates to Firestore
    let categorized = 0;
    let skippedLowConfidence = 0;
    const timestamp = nowISO();

    let batch = db.batch();
    let batchCount = 0;

    for (let i = 0; i < eligible.length; i++) {
      const txn = eligible[i];
      const result = results[i];

      // Skip low-confidence results
      if (result.confidence <= 0.5) {
        skippedLowConfidence++;
        continue;
      }

      // Skip if category didn't change
      if (result.categoryId === txn.oldCategoryId) {
        continue;
      }

      const docRef = colRef.doc(txn.id);
      batch.update(docRef, {
        categoryId: result.categoryId,
        categoryMatchType: 'ai',
        ...(result.reason ? { categoryReason: result.reason } : {}),
        updatedAt: timestamp,
      });
      batchCount++;
      categorized++;

      // Firestore batch limit is 500
      if (batchCount >= 500) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      processed: eligible.length,
      categorized,
      skippedLowConfidence,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('Error running AI categorization:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
