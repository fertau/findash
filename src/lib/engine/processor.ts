import { normalizeDescription, computeTransactionHash, dateToPeriod } from '@/lib/utils';
import { checkExclusion } from './exclusions';
import { detectInstallment } from './installment-detector';
import { categorizeBatch } from './categorizer';
import { aiCategorizeBatch, isAICategorizationAvailable } from './ai-categorizer';
import type { AICategorizeInput } from './ai-categorizer';
import { findByHash } from '@/lib/db/transactions';
import type {
  RawParsedTransaction,
  Transaction,
  Category,
  CategorizationRule,
  ExclusionRule,
  HouseholdMember,
  CardMapping,
} from '@/lib/db/types';

export interface ProcessorContext {
  householdId: string;
  sourceId: string;
  memberId: string;
  importBatchId: string;
  rules: CategorizationRule[];
  exclusionRules: ExclusionRule[];
  members: HouseholdMember[];
  cardMappings: CardMapping[];
  categories?: Category[];  // needed for AI categorization
}

export interface ProcessResult {
  transactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>[];
  duplicatesSkipped: number;
  errors: string[];
}

/**
 * Process a batch of raw parsed transactions through the full pipeline:
 * 1. Normalize descriptions
 * 2. Compute hashes & dedup check
 * 3. Run exclusion engine
 * 4. Detect installments
 * 5. Categorize
 * 6. Return enriched transactions ready for Firestore
 */
export async function processTransactions(
  raw: RawParsedTransaction[],
  ctx: ProcessorContext
): Promise<ProcessResult> {
  const transactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  let duplicatesSkipped = 0;
  const errors: string[] = [];

  // Step 1: Normalize all descriptions
  const normalized = raw.map((r) => ({
    ...r,
    normalizedDescription: normalizeDescription(r.description),
  }));

  // Step 2: Compute hashes and check for duplicates
  const deduped: (typeof normalized[0] & { hash: string })[] = [];
  for (const tx of normalized) {
    const hash = computeTransactionHash(
      tx.date,
      tx.description,
      tx.amount,
      tx.currency,
      ctx.sourceId
    );

    try {
      const existing = await findByHash(ctx.householdId, hash);
      if (existing) {
        duplicatesSkipped++;
        continue;
      }
    } catch (err) {
      // If dedup check fails, allow the transaction through
      errors.push(`Dedup check failed for "${tx.description}": ${err}`);
    }

    deduped.push({ ...tx, hash });
  }

  if (deduped.length === 0) {
    return { transactions: [], duplicatesSkipped, errors };
  }

  // Step 3: Run exclusion engine on all transactions
  const exclusionResults = deduped.map((tx) =>
    checkExclusion(
      {
        description: tx.description,
        normalizedDescription: tx.normalizedDescription,
        memberId: ctx.memberId,
        sourceId: ctx.sourceId,
        date: tx.date,
      },
      ctx.exclusionRules,
      ctx.members,
      ctx.cardMappings
    )
  );

  // Step 4: Detect installments
  const installmentResults = deduped.map((tx) =>
    detectInstallment(tx.normalizedDescription, tx.amount)
  );

  // Step 5: Categorize non-excluded transactions
  // Use clean description (without installment notation) for better matching
  const descriptionsForCategorization = deduped.map((tx, i) => {
    const installment = installmentResults[i];
    return installment?.cleanDescription || tx.normalizedDescription;
  });

  const categoryResults = categorizeBatch(descriptionsForCategorization, ctx.rules);

  // Step 5.5: AI categorization for transactions that rules couldn't categorize
  const aiReasons = new Map<number, string>();
  if (ctx.categories && isAICategorizationAvailable()) {
    const uncategorizedIndices: number[] = [];
    const aiInputs: AICategorizeInput[] = [];

    for (let i = 0; i < categoryResults.length; i++) {
      if (categoryResults[i].matchType === 'uncategorized' && !exclusionResults[i].excluded) {
        uncategorizedIndices.push(i);
        aiInputs.push({
          description: deduped[i].description,
          normalizedDescription: deduped[i].normalizedDescription,
          amount: deduped[i].amount,
          currency: deduped[i].currency,
        });
      }
    }

    if (aiInputs.length > 0) {
      try {
        const aiResults = await aiCategorizeBatch(aiInputs, ctx.categories);
        for (let j = 0; j < aiResults.length; j++) {
          const idx = uncategorizedIndices[j];
          if (aiResults[j].confidence > 0.5 && aiResults[j].categoryId !== 'cat_sin_categorizar') {
            categoryResults[idx] = {
              categoryId: aiResults[j].categoryId,
              matchType: 'ai',
            };
            if (aiResults[j].reason) {
              aiReasons.set(idx, aiResults[j].reason);
            }
          }
        }
      } catch (err) {
        errors.push(`AI categorization failed: ${err}`);
      }
    }
  }

  // Step 6: Assemble enriched transactions
  for (let i = 0; i < deduped.length; i++) {
    const raw = deduped[i];
    const exclusion = exclusionResults[i];
    const installment = installmentResults[i];
    const category = categoryResults[i];

    let period: string;
    try {
      period = dateToPeriod(raw.date);
    } catch {
      errors.push(`Invalid date "${raw.date}" for "${raw.description}"`);
      continue;
    }

    transactions.push({
      householdId: ctx.householdId,
      date: raw.date,
      period,
      description: raw.description,
      normalizedDescription: raw.normalizedDescription,
      amount: raw.amount,
      currency: raw.currency,
      categoryId: exclusion.excluded ? 'cat_sin_categorizar' : category.categoryId,
      categoryMatchType: exclusion.excluded ? 'uncategorized' : category.matchType,
      ...(aiReasons.has(i) ? { categoryReason: aiReasons.get(i) } : {}),
      sourceId: ctx.sourceId,
      memberId: ctx.memberId,
      isExcluded: exclusion.excluded,
      isExtraordinary: false,
      importBatchId: ctx.importBatchId,
      hash: raw.hash,
      ...(exclusion.reason ? { exclusionReason: exclusion.reason } : {}),
      ...(installment ? { installment: { current: installment.current, total: installment.total, groupId: installment.groupId } } : {}),
    });
  }

  return { transactions, duplicatesSkipped, errors };
}
