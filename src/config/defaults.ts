/**
 * Default exclusion rule patterns.
 * Seeded as EXAMPLES when a household is created. Fully editable via Settings.
 * Users should review and customize these for their specific financial institutions.
 */
export const DEFAULT_EXCLUSION_PATTERNS: Array<{
  pattern: string;
  matchType: 'regex' | 'contains' | 'exact';
  reason: string;
}> = [
  // No default exclusions — users configure their own via Settings → Exclusion Rules.
  // Examples they might add:
  // { pattern: 'INVESTMENT FUND', matchType: 'contains', reason: 'Investment flow, not expense' },
  // { pattern: 'INTERNAL TRANSFER', matchType: 'contains', reason: 'Internal transfer between accounts' },
];

/**
 * Default installment detection patterns for LATAM card statements.
 * Each pattern must have exactly two capture groups: (current, total).
 */
export const DEFAULT_INSTALLMENT_PATTERNS = [
  '(\\d{1,2})\\s*/\\s*(\\d{1,2})',            // "3/12", "03/12"
  'C\\.?\\s*(\\d{1,2})\\s*/\\s*(\\d{1,2})',   // "C.01/03", "C 2/6"
  'CUOTA\\s*(\\d{1,2})\\s*DE\\s*(\\d{1,2})',   // "CUOTA 5 DE 8"
  'CTA\\s*(\\d{1,2})\\s*/\\s*(\\d{1,2})',      // "CTA 3/6"
];
