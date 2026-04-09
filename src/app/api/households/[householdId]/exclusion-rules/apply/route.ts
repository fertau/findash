import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { getAllExclusionRules } from '@/lib/db/categories';
import { getMembers, getCardMappings } from '@/lib/db/households';
import { checkExclusion } from '@/lib/engine/exclusions';
import { getAdminDb, transactionsCollection } from '@/lib/firebase/admin';
import { nowISO } from '@/lib/utils';

interface Params {
  params: Promise<{ householdId: string }>;
}

const BATCH_SIZE = 500;

/**
 * POST /api/households/[householdId]/exclusion-rules/apply
 * Re-apply all exclusion rules to existing transactions.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId, 'owner');

    // Load exclusion rules, members, and card mappings in parallel
    const [exclusionRules, members, cardMappings] = await Promise.all([
      getAllExclusionRules(householdId),
      getMembers(householdId),
      getCardMappings(householdId),
    ]);

    const txCollection = transactionsCollection(householdId);
    const firestoreDb = getAdminDb();

    // Load all transactions in paginated batches of 500
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    let updated = 0;
    let excluded = 0;
    let unexcluded = 0;
    const timestamp = nowISO();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      let query = txCollection.orderBy('__name__').limit(BATCH_SIZE);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      if (snapshot.empty) break;

      // Collect updates for this page
      const updates: { ref: FirebaseFirestore.DocumentReference; isExcluded: boolean; exclusionReason?: string }[] = [];

      for (const doc of snapshot.docs) {
        const data = doc.data();

        const result = checkExclusion(
          {
            description: data.description ?? '',
            normalizedDescription: data.normalizedDescription ?? '',
            memberId: data.memberId ?? '',
            sourceId: data.sourceId ?? '',
            date: data.date ?? '',
            cardLastFour: data.cardLastFour,
          },
          exclusionRules,
          members,
          cardMappings,
        );

        const currentlyExcluded = Boolean(data.isExcluded);
        if (result.excluded !== currentlyExcluded) {
          updates.push({
            ref: doc.ref,
            isExcluded: result.excluded,
            exclusionReason: result.reason,
          });

          if (result.excluded) {
            excluded++;
          } else {
            unexcluded++;
          }
        }
      }

      // Batch-write updates (max 500 per Firestore batch)
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = firestoreDb.batch();
        const chunk = updates.slice(i, i + BATCH_SIZE);

        for (const { ref, isExcluded, exclusionReason } of chunk) {
          const updateData: Record<string, unknown> = {
            isExcluded,
            updatedAt: timestamp,
          };
          if (isExcluded && exclusionReason) {
            updateData.exclusionReason = exclusionReason;
          } else {
            updateData.exclusionReason = null;
          }
          batch.update(ref, updateData);
        }

        await batch.commit();
      }

      updated += updates.length;
      lastDoc = snapshot.docs[snapshot.docs.length - 1];

      // If we got fewer than BATCH_SIZE, we've reached the end
      if (snapshot.size < BATCH_SIZE) break;
    }

    return NextResponse.json({ updated, excluded, unexcluded });
  } catch (error: unknown) {
    if (error instanceof Error && 'status' in error) {
      const httpError = error as Error & { status: number };
      return NextResponse.json(
        { error: httpError.message },
        { status: httpError.status },
      );
    }
    console.error('Error applying exclusion rules:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
