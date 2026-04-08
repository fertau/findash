import type { CategorizationRule, CategoryMatchType, RuleMatchType } from '@/lib/db/types';

export interface CategorizationResult {
  categoryId: string;
  matchType: CategoryMatchType;
}

/**
 * Categorize a transaction description using a three-tier rule cascade:
 * 1. Exact match (highest priority)
 * 2. Contains / Regex match
 * 3. Uncategorized fallback
 *
 * Rules are evaluated in priority order (lower number = higher priority).
 */
export function categorize(
  normalizedDescription: string,
  rules: CategorizationRule[]
): CategorizationResult {
  // Sort rules by priority (ascending — lower number = higher priority)
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    if (matchesRule(normalizedDescription, rule.pattern, rule.matchType)) {
      return {
        categoryId: rule.categoryId,
        matchType: rule.matchType,
      };
    }
  }

  return {
    categoryId: 'cat_sin_categorizar',
    matchType: 'uncategorized',
  };
}

/**
 * Batch categorize transactions.
 * Builds optimized lookup structures for efficiency.
 */
export function categorizeBatch(
  descriptions: string[],
  rules: CategorizationRule[]
): CategorizationResult[] {
  // Pre-sort rules once
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);

  // Build exact match map for O(1) lookups
  const exactMap = new Map<string, CategorizationResult>();
  const nonExactRules: CategorizationRule[] = [];

  for (const rule of sorted) {
    if (rule.matchType === 'exact') {
      const key = rule.pattern.toUpperCase();
      if (!exactMap.has(key)) {
        exactMap.set(key, {
          categoryId: rule.categoryId,
          matchType: 'exact',
        });
      }
    } else {
      nonExactRules.push(rule);
    }
  }

  // Pre-compile regex patterns
  const compiledRules = nonExactRules.map((rule) => ({
    ...rule,
    compiled: rule.matchType === 'regex' ? safeCompileRegex(rule.pattern) : null,
  }));

  return descriptions.map((desc) => {
    // Try exact match first
    const exact = exactMap.get(desc);
    if (exact) return exact;

    // Try contains/regex rules in priority order
    for (const rule of compiledRules) {
      if (rule.matchType === 'contains') {
        if (desc.includes(rule.pattern.toUpperCase())) {
          return { categoryId: rule.categoryId, matchType: 'contains' as CategoryMatchType };
        }
      } else if (rule.matchType === 'regex' && rule.compiled) {
        if (rule.compiled.test(desc)) {
          return { categoryId: rule.categoryId, matchType: 'regex' as CategoryMatchType };
        }
      }
    }

    return { categoryId: 'cat_sin_categorizar', matchType: 'uncategorized' as CategoryMatchType };
  });
}

function matchesRule(
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
        return false;
      }

    default:
      return false;
  }
}

function safeCompileRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}
