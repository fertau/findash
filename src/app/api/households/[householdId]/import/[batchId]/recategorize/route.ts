import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { getImportBatch } from '@/lib/db/import-log';
import { getTransactionsByImportBatch, updateTransaction } from '@/lib/db/transactions';
import { getCategories, getRules } from '@/lib/db/categories';
import { categorizeBatch } from '@/lib/engine/categorizer';
import { aiCategorizeBatch } from '@/lib/engine/ai-categorizer';
import type { AICategorizeInput } from '@/lib/engine/ai-categorizer';

interface Params {
  params: Promise<{ householdId: string; batchId: string }>;
}

/**
 * POST /api/households/[householdId]/import/[batchId]/recategorize
 * Re-run categorization (rules + AI) on all transactions from a specific import batch.
 * Skips transactions with categoryMatchType === 'manual' (user overrides preserved).
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { householdId, batchId } = await params;
    await withHouseholdAuth(request, householdId, 'owner');

    // Verify batch exists
    const batch = await getImportBatch(householdId, batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Import batch not found' }, { status: 404 });
    }

    if (batch.status === 'deleted') {
      return NextResponse.json({ error: 'Cannot recategorize a deleted batch' }, { status: 400 });
    }

    // Load transactions, categories, and rules
    const [transactions, categories, rules] = await Promise.all([
      getTransactionsByImportBatch(householdId, batchId),
      getCategories(householdId),
      getRules(householdId),
    ]);

    // Filter out manually categorized transactions (preserve user overrides)
    const eligible = transactions.filter((tx) => tx.categoryMatchType !== 'manual');

    if (eligible.length === 0) {
      return NextResponse.json({
        processed: 0,
        categorizedByRules: 0,
        categorizedByAI: 0,
        stillUncategorized: 0,
      });
    }

    // Step 1: Rule-based categorization
    const descriptions = eligible.map((tx) => tx.normalizedDescription);
    const ruleResults = categorizeBatch(descriptions, rules);

    let categorizedByRules = 0;
    let categorizedByAI = 0;
    let stillUncategorized = 0;

    // Collect indices of transactions still uncategorized after rules
    const uncategorizedIndices: number[] = [];
    for (let i = 0; i < ruleResults.length; i++) {
      if (ruleResults[i].matchType === 'uncategorized') {
        uncategorizedIndices.push(i);
      } else {
        categorizedByRules++;
      }
    }

    // Step 2: AI categorization for remaining uncategorized
    if (uncategorizedIndices.length > 0) {
      const aiInputs: AICategorizeInput[] = uncategorizedIndices.map((idx) => ({
        description: eligible[idx].description,
        normalizedDescription: eligible[idx].normalizedDescription,
        amount: eligible[idx].amount,
        currency: eligible[idx].currency,
      }));

      const aiResults = await aiCategorizeBatch(aiInputs, categories);

      for (let j = 0; j < uncategorizedIndices.length; j++) {
        const idx = uncategorizedIndices[j];
        const aiResult = aiResults[j];
        if (aiResult.matchType === 'ai' && aiResult.categoryId !== 'cat_sin_categorizar') {
          ruleResults[idx] = {
            categoryId: aiResult.categoryId,
            matchType: aiResult.matchType,
          };
          // Store AI reason for later update
          (ruleResults[idx] as { categoryId: string; matchType: string; reason?: string }).reason = aiResult.reason;
          categorizedByAI++;
        } else {
          stillUncategorized++;
        }
      }
    }

    // Step 3: Batch-update changed transactions in Firestore
    const updatePromises: Promise<void>[] = [];
    for (let i = 0; i < eligible.length; i++) {
      const tx = eligible[i];
      const result = ruleResults[i] as { categoryId: string; matchType: string; reason?: string };

      // Only update if the category actually changed
      if (result.categoryId !== tx.categoryId || result.matchType !== tx.categoryMatchType) {
        const updates: Record<string, unknown> = {
          categoryId: result.categoryId,
          categoryMatchType: result.matchType,
        };
        if (result.reason) {
          updates.categoryReason = result.reason;
        } else if (tx.categoryReason && result.matchType !== 'ai') {
          // Clear AI reason if now categorized by rules
          updates.categoryReason = null;
        }
        updatePromises.push(updateTransaction(householdId, tx.id, updates));
      }
    }

    await Promise.all(updatePromises);

    return NextResponse.json({
      processed: eligible.length,
      categorizedByRules,
      categorizedByAI,
      stillUncategorized,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[recategorize] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
