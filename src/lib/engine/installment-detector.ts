import { createHash } from 'crypto';
import { DEFAULT_INSTALLMENT_PATTERNS } from '@/config/defaults';

export interface InstallmentInfo {
  current: number;
  total: number;
  cleanDescription: string;
  groupId: string;
}

// Pre-compile default patterns
const COMPILED_PATTERNS = DEFAULT_INSTALLMENT_PATTERNS.map(
  (p) => new RegExp(p, 'i')
);

/**
 * Detect installment information from a transaction description.
 *
 * Handles common LATAM card statement formats:
 * - "SAURA 3/12" — cuota 3 of 12
 * - "C.01/03" — cuota 1 of 3
 * - "CUOTA 5 DE 8"
 * - "CTA 3/6"
 *
 * Returns null if no installment pattern is found.
 */
export function detectInstallment(
  description: string,
  amount?: number
): InstallmentInfo | null {
  const normalized = description.trim().toUpperCase();

  for (const pattern of COMPILED_PATTERNS) {
    const match = normalized.match(pattern);
    if (match && match[1] && match[2]) {
      const current = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);

      // Sanity checks
      if (current < 1 || total < 2 || current > total || total > 99) {
        continue;
      }

      const cleanDescription = cleanInstallmentDescription(normalized);
      const groupId = generateGroupId(cleanDescription, total, amount);

      return { current, total, cleanDescription, groupId };
    }
  }

  return null;
}

/**
 * Remove installment notation from description to get the base merchant/concept.
 * "SAURA 3/12" → "SAURA"
 * "C.01/03 FARMACIA VIDA" → "FARMACIA VIDA"
 */
function cleanInstallmentDescription(description: string): string {
  return description
    .replace(/C\.?\s*\d{1,2}\s*\/\s*\d{1,2}/gi, '')
    .replace(/CTA\s*\d{1,2}\s*\/\s*\d{1,2}/gi, '')
    .replace(/CUOTA\s*\d{1,2}\s*DE\s*\d{1,2}/gi, '')
    .replace(/\d{1,2}\s*\/\s*\d{1,2}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate a deterministic group ID for related installments.
 * Same merchant + same total installments + same individual amount = same group.
 */
function generateGroupId(
  cleanDescription: string,
  totalInstallments: number,
  amount?: number
): string {
  const payload = `${cleanDescription}|${totalInstallments}|${amount?.toFixed(2) ?? '0'}`;
  return createHash('md5').update(payload).digest('hex').substring(0, 16);
}
