/**
 * Default exclusion rule patterns.
 * Seeded into each new household on creation. Fully editable via API afterward.
 */
export const DEFAULT_EXCLUSION_PATTERNS = [
  {
    pattern: 'BALANZ|DOLAR MEP|MEP.*ARBITRAJE',
    matchType: 'regex' as const,
    reason: 'MEP/arbitrage operation — not an expense',
  },
  {
    pattern: 'FIMA|FONDO COMUN|FCI|SUSCRIPCION.*FONDO|RESCATE.*FONDO',
    matchType: 'regex' as const,
    reason: 'Investment fund flow — not an expense',
  },
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
