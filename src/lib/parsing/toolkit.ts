/**
 * Parsing Toolkit — shared primitives for building bank statement parsers.
 *
 * Use these building blocks when writing new parser plugins.
 * They handle LATAM-specific formatting (dots = thousands, comma = decimal),
 * Spanish month names, installment notation, and common line classification.
 */

import type { Currency } from '@/lib/db/types';
import type { RawParsedTransaction } from '@/lib/db/types';

// ─── Amount Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse an Argentine/Uruguayan formatted amount string.
 * Dots are thousands separators, comma is decimal separator.
 *
 * Examples:
 *   "1.234.567,89"  →  1234567.89
 *   "-267.170,00"   → -267170.00
 *   "30.801,66-"    → -30801.66  (trailing minus = credit)
 *   "$ 1.234,00"    →  1234.00
 *   "U$S 500,00"    →  500.00
 */
export function parseLatamAmount(raw: string): number {
  let s = raw.trim();
  let negative = false;
  if (s.startsWith('-') || s.startsWith('- ')) {
    negative = true;
    s = s.replace(/^-\s*/, '');
  }
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1).trim();
  }
  // Remove currency symbols, spaces
  s = s.replace(/[$U\sS]/g, '');
  if (!s) return NaN;
  // Replace dots (thousands) then comma (decimal)
  s = s.replace(/\./g, '').replace(',', '.');
  const val = parseFloat(s);
  return isNaN(val) ? NaN : (negative ? -val : val);
}

/** Standard regex to match one LATAM-formatted amount (no sign prefix). */
export const AMOUNT_RE = /([\d.]+,\d{2})/g;

/** Same but allows trailing minus for credits. */
export const AMOUNT_CREDIT_RE = /([\d.]+,\d{2}-?)/g;

/** Match a currency-prefixed amount: $, -$, U$S, -U$S */
export const CURRENCY_AMOUNT_RE = /(-?\s*(?:U\$S|\$)\s*-?\s*[\d.]+,\d{2})/g;

/**
 * Extract all amount strings from a line using the given pattern.
 * Returns the raw matched strings (call parseLatamAmount on each).
 */
export function extractAmounts(line: string, pattern: RegExp = AMOUNT_RE): string[] {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  return [...line.matchAll(re)].map((m) => m[1]);
}

// ─── Date Parsing ───────────────────────────────────────────────────────────────

/** 3-letter Spanish month abbreviations → MM */
export const MONTH_ABBR_3: Record<string, string> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', set: '09', oct: '10', nov: '11', dic: '12',
};

/** Spanish month names (truncated at natural break) → MM */
export const MONTH_LONG: Record<string, string> = {
  enero: '01', febrer: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', setiem: '09', octubr: '10', noviem: '11', diciem: '12',
};

/**
 * Resolve a Spanish month string to a 2-digit MM.
 * Tries full string, then progressively shorter prefixes.
 * Works with "Diciembre", "Diciem.", "Dic", etc.
 */
export function resolveMonth(raw: string): string | null {
  const s = raw.replace('.', '').toLowerCase().trim();
  // Try 3-letter abbreviation
  if (MONTH_ABBR_3[s.slice(0, 3)]) return MONTH_ABBR_3[s.slice(0, 3)];
  // Try long form (exact, then truncated)
  if (MONTH_LONG[s]) return MONTH_LONG[s];
  if (MONTH_LONG[s.slice(0, 6)]) return MONTH_LONG[s.slice(0, 6)];
  if (MONTH_LONG[s.slice(0, 5)]) return MONTH_LONG[s.slice(0, 5)];
  return null;
}

/** Common date regexes for LATAM bank statements. */
export const DATE_PATTERNS = {
  /** DD/MM/YY — Galicia bank, Santander bank */
  slashDMY: /^(\d{2})\/(\d{2})\/(\d{2})/,
  /** DD-MM-YY — Galicia Visa */
  dashDMY: /^(\d{2})-(\d{2})-(\d{2})/,
  /** DD-Mmm-YY — Galicia Mastercard */
  dashDMonY: /^(\d{2})-([A-Za-z]{3})-(\d{2})/,
  /** YY Month DD — Santander card */
  ymD: /^(\d{2})\s+(Enero|Febrer\.?|Marzo|Abril|Mayo|Junio|Julio|Agosto|Setiem\.?|Octubr\.?|Noviem\.?|Diciem\.?)\s+(\d{1,2})/i,
  /** DD MM YY (space-separated) — Itaú */
  spaceDMY: /(\d{2})\s+(\d{2})\s+(\d{2})/,
} as const;

/**
 * Try to parse a date from the beginning of a line, returning DD/MM/YY and the rest.
 * Tries multiple common formats in order.
 */
export function parseDateFromLine(
  line: string,
  formats?: (keyof typeof DATE_PATTERNS)[]
): { date: string; rest: string; format: string } | null {
  const fmts = formats || (['slashDMY', 'dashDMonY', 'dashDMY', 'ymD', 'spaceDMY'] as const);

  for (const fmt of fmts) {
    const re = DATE_PATTERNS[fmt];
    const m = line.match(re);
    if (!m) continue;

    let date: string | null = null;

    switch (fmt) {
      case 'slashDMY':
        date = `${m[1]}/${m[2]}/${m[3]}`;
        break;
      case 'dashDMY':
        date = `${m[1]}/${m[2]}/${m[3]}`;
        break;
      case 'dashDMonY': {
        const month = resolveMonth(m[2]);
        if (!month) continue;
        date = `${m[1]}/${month}/${m[3]}`;
        break;
      }
      case 'ymD': {
        const month = resolveMonth(m[2]);
        if (!month) continue;
        date = `${m[3].padStart(2, '0')}/${month}/${m[1]}`;
        break;
      }
      case 'spaceDMY':
        date = `${m[1]}/${m[2]}/${m[3]}`;
        break;
    }

    if (date) {
      const rest = line.slice((m.index ?? 0) + m[0].length);
      return { date, rest, format: fmt };
    }
  }

  return null;
}

// ─── Description Utilities ──────────────────────────────────────────────────────

/** Strip installment notation (C.01/03, 3/12, etc.) from a description. */
export function stripInstallments(desc: string): string {
  return desc
    .replace(/\s*C\.\d{1,2}\/\d{1,2}\s*/g, ' ')
    .replace(/\s*\d{1,2}\/\d{1,2}\s*$/, '')
    .trim();
}

/** Clean up a raw description: collapse whitespace, strip leading symbols. */
export function cleanDescription(raw: string): string {
  let desc = raw.replace(/\s+/g, ' ').trim();
  desc = desc.replace(/^\*+\s*/, ''); // Leading asterisks
  desc = stripInstallments(desc);
  return desc || 'Sin descripcion';
}

// ─── Section Extraction ─────────────────────────────────────────────────────────

/**
 * Extract lines from a text section delimited by markers.
 * Returns the lines between startMarker and optional endMarker.
 */
export function extractSection(
  text: string,
  startMarker: string | RegExp,
  endMarker?: string | RegExp
): string[] {
  let startIdx: number;
  if (typeof startMarker === 'string') {
    startIdx = text.indexOf(startMarker);
  } else {
    const m = text.match(startMarker);
    startIdx = m ? (m.index ?? -1) : -1;
  }
  if (startIdx === -1) return [];

  let section = text.slice(startIdx);
  if (endMarker) {
    let endIdx: number;
    if (typeof endMarker === 'string') {
      endIdx = section.indexOf(endMarker, 1);
    } else {
      const m = section.slice(1).match(endMarker);
      endIdx = m ? (m.index ?? -1) + 1 : -1;
    }
    if (endIdx > 0) section = section.slice(0, endIdx);
  }

  return section.split('\n');
}

// ─── Line Classification ────────────────────────────────────────────────────────

/** Test whether a line should be skipped (matches any of the patterns). */
export function shouldSkipLine(line: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(line));
}

// ─── Transaction Builder ────────────────────────────────────────────────────────

/** Build a RawParsedTransaction with validation. */
export function tx(
  date: string,
  description: string,
  amount: number,
  currency: Currency
): RawParsedTransaction | null {
  if (isNaN(amount) || amount === 0) return null;
  return { date, description: cleanDescription(description), amount, currency };
}

/** Build a card transaction (always negative for charges, positive for credits). */
export function cardTx(
  date: string,
  description: string,
  amount: number,
  currency: Currency,
  isCredit = false
): RawParsedTransaction | null {
  if (isNaN(amount) || amount === 0) return null;
  const finalAmt = isCredit ? Math.abs(amount) : -Math.abs(amount);
  return { date, description: cleanDescription(description), amount: finalAmt, currency };
}
