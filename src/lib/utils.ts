import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { createHash } from 'crypto';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalize a bank transaction description for matching.
 * Trims, uppercases, removes accents, collapses multiple spaces.
 */
export function normalizeDescription(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/\s+/g, ' ');
}

/**
 * Compute a SHA256 hash for transaction dedup.
 * Uses date + description + amount + currency + sourceId to identify unique transactions.
 */
export function computeTransactionHash(
  date: string,
  description: string,
  amount: number,
  currency: string,
  sourceId: string
): string {
  const normalized = normalizeDescription(description);
  const payload = `${date}|${normalized}|${amount.toFixed(2)}|${currency}|${sourceId}`;
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Extract period (YYYY-MM) from a date string.
 */
export function dateToPeriod(date: string): string {
  // Handles YYYY-MM-DD, DD/MM/YYYY, DD/MM/YY, DD-MM-YYYY, DD-MM-YY
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date.substring(0, 7);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    const [, mm, yyyy] = date.split('/');
    return `${yyyy}-${mm}`;
  }
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(date)) {
    const [, mm, yy] = date.split('/');
    return `20${yy}-${mm}`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(date)) {
    const [, mm, yyyy] = date.split('-');
    return `${yyyy}-${mm}`;
  }
  if (/^\d{2}-\d{2}-\d{2}$/.test(date)) {
    const [, mm, yy] = date.split('-');
    return `20${yy}-${mm}`;
  }
  throw new Error(`Unrecognized date format: ${date}`);
}

/**
 * Parse various date formats into ISO YYYY-MM-DD.
 */
export function parseDate(dateStr: string, format?: string): string {
  const trimmed = dateStr.trim();

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [dd, mm, yyyy] = trimmed.split('/');
    return `${yyyy}-${mm}-${dd}`;
  }

  // DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    const [dd, mm, yyyy] = trimmed.split('-');
    return `${yyyy}-${mm}-${dd}`;
  }

  // DD-MM-YY (two-digit year, assume 2000s)
  if (/^\d{2}-\d{2}-\d{2}$/.test(trimmed)) {
    const [dd, mm, yy] = trimmed.split('-');
    return `20${yy}-${mm}-${dd}`;
  }

  // DD/MM/YY
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(trimmed)) {
    const [dd, mm, yy] = trimmed.split('/');
    return `20${yy}-${mm}-${dd}`;
  }

  // Use hint format
  if (format === 'MM/DD/YYYY' && /^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [mm, dd, yyyy] = trimmed.split('/');
    return `${yyyy}-${mm}-${dd}`;
  }

  throw new Error(`Cannot parse date: "${dateStr}" (format hint: ${format || 'none'})`);
}

/**
 * Format an amount with locale-aware thousand separators.
 */
export function formatCurrency(amount: number, currency: string): string {
  const locale = currency === 'USD' ? 'en-US' : 'es-AR';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Get current ISO timestamp.
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Parse an amount string that may use comma as decimal separator.
 * "1.234,50" → 1234.50
 * "1,234.50" → 1234.50
 * "5234.50"  → 5234.50
 */
export function parseAmount(amountStr: string): number {
  const trimmed = amountStr.trim().replace(/[^\d.,-]/g, '');

  // If it has both comma and period, determine which is decimal
  if (trimmed.includes(',') && trimmed.includes('.')) {
    const lastComma = trimmed.lastIndexOf(',');
    const lastDot = trimmed.lastIndexOf('.');

    if (lastComma > lastDot) {
      // Comma is decimal: "1.234,50"
      return parseFloat(trimmed.replace(/\./g, '').replace(',', '.'));
    } else {
      // Dot is decimal: "1,234.50"
      return parseFloat(trimmed.replace(/,/g, ''));
    }
  }

  // Only comma — could be decimal or thousand
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',');
    const lastPart = parts[parts.length - 1];
    if (lastPart.length <= 2) {
      // Comma is decimal: "5234,50"
      return parseFloat(trimmed.replace(',', '.'));
    }
    // Comma is thousand: "1,234"
    return parseFloat(trimmed.replace(/,/g, ''));
  }

  return parseFloat(trimmed);
}
