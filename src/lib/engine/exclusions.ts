import type { ExclusionRule, HouseholdMember, CardMapping, RuleMatchType } from '@/lib/db/types';

export interface ExclusionCheckResult {
  excluded: boolean;
  reason?: string;
}

interface TransactionContext {
  description: string;
  normalizedDescription: string;
  memberId: string;
  sourceId: string;
  date: string;
  cardLastFour?: string;
}

/**
 * Check if a transaction should be excluded from expense analysis.
 *
 * Three layers of checks (in priority order):
 * 1. Member exclusion — the attributed member is flagged as excluded
 * 2. Card exclusion — the card mapping is flagged as excluded (with optional date threshold)
 * 3. Pattern-based exclusion rules — configurable regex/contains/exact patterns
 *
 * All rules are loaded from Firestore, nothing is hardcoded.
 */
export function checkExclusion(
  tx: TransactionContext,
  exclusionRules: ExclusionRule[],
  members: HouseholdMember[],
  cardMappings: CardMapping[]
): ExclusionCheckResult {
  // Layer 1: Member exclusion
  const member = members.find((m) => m.userId === tx.memberId);
  if (member?.isExcluded) {
    return {
      excluded: true,
      reason: member.exclusionReason || `Member "${member.displayName}" excluded from analysis`,
    };
  }

  // Layer 2: Card mapping exclusion
  const card = cardMappings.find(
    (c) => c.sourceId === tx.sourceId && (!c.lastFour || c.lastFour === tx.cardLastFour)
  );
  if (card?.isExcluded) {
    // Check date-based exclusion
    if (card.excludeBeforeDate && tx.date >= card.excludeBeforeDate) {
      // Transaction is AFTER the exclusion cutoff — not excluded
    } else {
      return {
        excluded: true,
        reason: card.notes || 'Card excluded from analysis',
      };
    }
  }

  // Layer 3: Pattern-based exclusion rules
  for (const rule of exclusionRules) {
    if (!rule.isActive) continue;

    if (matchesPattern(tx.normalizedDescription, rule.pattern, rule.matchType)) {
      return {
        excluded: true,
        reason: rule.reason,
      };
    }
  }

  return { excluded: false };
}

function matchesPattern(
  text: string,
  pattern: string,
  matchType: RuleMatchType
): boolean {
  switch (matchType) {
    case 'exact':
      return text === pattern.toUpperCase();

    case 'contains':
      return text.includes(pattern.toUpperCase());

    case 'regex':
      try {
        return new RegExp(pattern, 'i').test(text);
      } catch {
        // Invalid regex — skip this rule
        return false;
      }

    default:
      return false;
  }
}
