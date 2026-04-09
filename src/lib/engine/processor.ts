import { normalizeDescription, computeTransactionHash, dateToPeriod } from '@/lib/utils';
import { checkExclusion } from './exclusions';
import { detectInstallment } from './installment-detector';
import { categorizeBatch } from './categorizer';
import { findByHash } from '@/lib/db/transactions';
import type {
  RawParsedTransaction,
  Transaction,
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
