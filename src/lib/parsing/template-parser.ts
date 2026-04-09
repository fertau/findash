/**
 * Template Parser Engine
 *
 * Interprets a ParserTemplate configuration to parse PDF text into transactions.
 * Templates are JSON-serializable and can be stored in Firestore, allowing users
 * to define new bank statement parsers without writing code.
 *
 * Typical flow:
 *   1. User uploads an unrecognized PDF
 *   2. System shows extracted text + template builder UI
 *   3. User configures: section markers, date format, skip patterns, currency, etc.
 *   4. Template is saved to Firestore (household-scoped)
 *   5. Future imports with matching fingerprints auto-apply the template
 */

import type { ParserTemplate, Currency, RawParsedTransaction, DateFormatKey } from '@/lib/db/types';
import type { ParserPlugin } from './parser-registry';
import {
  parseLatamAmount,
  AMOUNT_RE,
  AMOUNT_CREDIT_RE,
  CURRENCY_AMOUNT_RE,
  extractAmounts,
  parseDateFromLine,
  resolveMonth,
  cleanDescription,
  shouldSkipLine,
  DATE_PATTERNS,
} from './toolkit';

// ─── Template → Plugin adapter ──────────────────────────────────────────────────

/**
 * Convert a ParserTemplate into a ParserPlugin that can be registered.
 * This bridges the config-driven world with the code-driven registry.
 */
export function templateToPlugin(template: ParserTemplate): ParserPlugin {
  return {
    key: `template_${template.id}`,
    label: template.label,
    institution: template.institution,
    documentType: template.documentType,
    fingerprints: template.fingerprints.map((f) => new RegExp(f, 'i')),
    parse: (text: string) => executeTemplate(template, text),
  };
}

// ─── Date format → toolkit format mapping ────────────────────────────────────────

const DATE_FORMAT_MAP: Record<DateFormatKey, (keyof typeof DATE_PATTERNS)[]> = {
  'DD/MM/YY': ['slashDMY'],
  'DD-MM-YY': ['dashDMY'],
  'DD-Mmm-YY': ['dashDMonY'],
  'YY-Month-DD': ['ymD'],
  'DD MM YY': ['spaceDMY'],
};

// ─── Pattern compilation ────────────────────────────────────────────────────────

/** Compile a string into a RegExp. Supports "/pattern/flags" notation or plain strings. */
function compilePattern(pattern: string): RegExp {
  const regexMatch = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
  if (regexMatch) {
    return new RegExp(regexMatch[1], regexMatch[2]);
  }
  // Plain string: escape and use as literal match
  return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

// ─── Section extraction ─────────────────────────────────────────────────────────

function extractSectionText(text: string, template: ParserTemplate): string {
  let result = text;

  if (template.sectionStart) {
    const startRe = compilePattern(template.sectionStart);
    const match = result.match(startRe);
    if (match && match.index !== undefined) {
      result = result.slice(match.index);
    } else {
      // If section start not found, return empty — no transactions to parse
      return '';
    }
  }

  if (template.sectionEnd) {
    const endRe = compilePattern(template.sectionEnd);
    const match = result.slice(1).match(endRe);
    if (match && match.index !== undefined) {
      result = result.slice(0, match.index + 1);
    }
  }

  return result;
}

// ─── Main template execution engine ─────────────────────────────────────────────

function executeTemplate(template: ParserTemplate, text: string): RawParsedTransaction[] {
  // Handle section-based currency mode separately
  if (template.dualCurrency?.mode === 'section') {
    return executeSectionCurrencyTemplate(template, text);
  }

  const sectionText = extractSectionText(text, template);
  if (!sectionText) return [];

  const lines = sectionText.split('\n');
  const skipPatterns = template.skipPatterns.map((p) => compilePattern(p));
  const pageHeaderRe = template.pageHeaderPattern ? compilePattern(template.pageHeaderPattern) : null;
  const descCleanupRes = (template.descriptionCleanup || []).map((p) => compilePattern(p));
  const dateFormats = DATE_FORMAT_MAP[template.dateFormat];
  const amountRe = template.hasTrailingMinus ? AMOUNT_CREDIT_RE : AMOUNT_RE;

  const transactions: RawParsedTransaction[] = [];

  // For YY-Month-DD format, we need to track current year/month across continuation lines
  let currentYear = '';
  let currentMonth = '';

  const isSkippable = (line: string) =>
    !line || (pageHeaderRe && pageHeaderRe.test(line)) || shouldSkipLine(line, skipPatterns);

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    i++;

    if (!trimmed) continue;
    if (pageHeaderRe && pageHeaderRe.test(trimmed)) continue;
    if (shouldSkipLine(trimmed, skipPatterns)) continue;

    // Try to parse a date from this line
    const dateResult = parseDateFromLine(trimmed, dateFormats);

    // Handle continuation lines (indented, no date — for YY-Month-DD format)
    if (!dateResult) {
      if (template.continuationMinIndent) {
        const leadingSpaces = raw.length - raw.trimStart().length;
        if (leadingSpaces >= template.continuationMinIndent && currentYear && currentMonth) {
          const dayMatch = trimmed.match(/^(\d{1,2})\s+(.+)/);
          if (dayMatch) {
            const day = dayMatch[1].padStart(2, '0');
            const date = `${day}/${currentMonth}/${currentYear}`;
            const restOfLine = dayMatch[2];
            const txResult = extractTransaction(restOfLine, date, template, amountRe, descCleanupRes);
            if (txResult) transactions.push(...txResult);
          }
        }
      }
      continue;
    }

    // We have a date — update tracking for YY-Month-DD continuation lines
    if (dateResult.format === 'ymD') {
      const ymMatch = trimmed.match(/^(\d{2})\s+(\S+)/);
      if (ymMatch) {
        currentYear = ymMatch[1];
        const monthStr = ymMatch[2].replace('.', '').toLowerCase();
        currentMonth = resolveMonth(monthStr) || currentMonth;
      }
    }

    const restOfLine = dateResult.rest.trim();

    // Try single-line extraction first
    const txResult = extractTransaction(restOfLine, dateResult.date, template, amountRe, descCleanupRes);
    if (txResult) {
      transactions.push(...txResult);
      continue;
    }

    // Multi-line transaction: date line has no amounts (or only description).
    // Collect continuation lines until we find one with amounts or hit a new date.
    const descParts: string[] = [restOfLine];
    let foundAmounts = false;

    while (i < lines.length) {
      const nextRaw = lines[i];
      const nextTrimmed = nextRaw.trim();

      if (!nextTrimmed) { i++; continue; }
      if (pageHeaderRe && pageHeaderRe.test(nextTrimmed)) { i++; continue; }
      if (shouldSkipLine(nextTrimmed, skipPatterns)) { i++; continue; }

      // If next line has a date, stop — this is a new transaction
      if (parseDateFromLine(nextTrimmed, dateFormats)) break;

      // Check if this line has amounts
      const lineAmounts = extractAmounts(nextTrimmed, amountRe);
      if (lineAmounts.length > 0) {
        // This line has the amounts — build the transaction
        const fullText = [...descParts, nextTrimmed].join(' ');
        let processedText = fullText;
        for (const re of descCleanupRes) {
          processedText = processedText.replace(re, '').trim();
        }

        const amounts = extractAmounts(processedText, amountRe);
        if (amounts.length > 0) {
          const firstAmtIdx = processedText.indexOf(amounts[0]);
          const rawDesc = processedText.slice(0, firstAmtIdx);
          const description = cleanDescription(rawDesc);

          let txAmounts = amounts;
          if (template.hasBalanceColumn && txAmounts.length >= 2) {
            txAmounts = txAmounts.slice(0, -1);
          }

          if (template.dualCurrency?.mode === 'column' && txAmounts.length >= 2) {
            const primaryAmt = parseAndSign(txAmounts[0], template);
            const secondaryAmt = parseAndSign(txAmounts[1], template);
            if (primaryAmt !== null) {
              transactions.push({ date: dateResult.date, description, amount: primaryAmt, currency: template.defaultCurrency });
            }
            if (secondaryAmt !== null) {
              transactions.push({ date: dateResult.date, description, amount: secondaryAmt, currency: template.dualCurrency.secondaryCurrency });
            }
          } else {
            for (const amtStr of txAmounts) {
              const amt = parseAndSign(amtStr, template);
              if (amt !== null) {
                transactions.push({ date: dateResult.date, description, amount: amt, currency: template.defaultCurrency });
              }
            }
          }
        }

        i++;
        foundAmounts = true;
        break;
      }

      // No amounts — this is a description continuation line
      descParts.push(nextTrimmed);
      i++;
    }

    // If we exhausted look-ahead without finding amounts, the description parts alone
    // might contain amounts (e.g. all on same conceptual line but split by pdf-parse)
    if (!foundAmounts && descParts.length > 1) {
      const fullText = descParts.join(' ');
      const txResult2 = extractTransaction(fullText, dateResult.date, template, amountRe, descCleanupRes);
      if (txResult2) transactions.push(...txResult2);
    }
  }

  return transactions;
}

// ─── Transaction extraction from a single line ──────────────────────────────────

function extractTransaction(
  restOfLine: string,
  date: string,
  template: ParserTemplate,
  amountRe: RegExp,
  descCleanupRes: RegExp[]
): RawParsedTransaction[] | null {
  // Apply description cleanup patterns (strip comprobante numbers, markers, etc.)
  let processedLine = restOfLine;
  for (const re of descCleanupRes) {
    processedLine = processedLine.replace(re, '').trim();
  }
  if (!processedLine) return null;

  // Extract amounts
  const amounts = extractAmounts(processedLine, amountRe);
  if (amounts.length === 0) return null;

  // Description is everything before the first amount
  const firstAmtIdx = processedLine.indexOf(amounts[0]);
  const rawDesc = processedLine.slice(0, firstAmtIdx);
  const description = cleanDescription(rawDesc);

  // Determine which amounts to use (skip balance column if configured)
  let txAmounts = amounts;
  if (template.hasBalanceColumn && txAmounts.length >= 2) {
    txAmounts = txAmounts.slice(0, -1); // last is balance
  }

  const results: RawParsedTransaction[] = [];

  if (template.dualCurrency && template.dualCurrency.mode === 'column' && txAmounts.length >= 2) {
    // Dual column: first = primary currency, second = secondary currency
    const primaryAmt = parseAndSign(txAmounts[0], template);
    const secondaryAmt = parseAndSign(txAmounts[1], template);

    if (primaryAmt !== null) {
      results.push({ date, description, amount: primaryAmt, currency: template.defaultCurrency });
    }
    if (secondaryAmt !== null) {
      results.push({
        date, description, amount: secondaryAmt,
        currency: template.dualCurrency.secondaryCurrency,
      });
    }
  } else {
    // Single currency or single amount
    for (const amtStr of txAmounts) {
      const amt = parseAndSign(amtStr, template);
      if (amt !== null) {
        results.push({ date, description, amount: amt, currency: template.defaultCurrency });
      }
    }
  }

  return results.length > 0 ? results : null;
}

// ─── Amount parsing with sign convention ────────────────────────────────────────

function parseAndSign(amtStr: string, template: ParserTemplate): number | null {
  let isTrailingCredit = false;
  let cleanStr = amtStr;

  if (template.hasTrailingMinus && cleanStr.endsWith('-')) {
    isTrailingCredit = true;
    cleanStr = cleanStr.slice(0, -1);
  }

  const amt = parseLatamAmount(cleanStr);
  if (isNaN(amt) || amt === 0) return null;

  if (isTrailingCredit) {
    // Trailing minus = credit (positive for the account holder)
    return Math.abs(amt);
  }

  if (template.negateAmounts) {
    // Card statements: charges are negative
    return -Math.abs(amt);
  }

  return amt;
}

// ─── Section-based currency template ────────────────────────────────────────────

function executeSectionCurrencyTemplate(
  template: ParserTemplate,
  text: string
): RawParsedTransaction[] {
  const sectionPatterns = template.dualCurrency?.sectionPatterns || [];
  const skipPatterns = template.skipPatterns.map((p) => compilePattern(p));
  const pageHeaderRe = template.pageHeaderPattern ? compilePattern(template.pageHeaderPattern) : null;
  const descCleanupRes = (template.descriptionCleanup || []).map((p) => compilePattern(p));
  const dateFormats = DATE_FORMAT_MAP[template.dateFormat];
  const amountRe = template.hasTrailingMinus ? AMOUNT_CREDIT_RE : AMOUNT_RE;

  const lines = text.split('\n');
  const transactions: RawParsedTransaction[] = [];
  let activeCurrency: Currency = template.defaultCurrency;

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    i++;

    if (!trimmed) continue;

    // Check for currency section switches
    let sectionSwitch = false;
    for (const sp of sectionPatterns) {
      const re = compilePattern(sp.pattern);
      if (re.test(trimmed)) {
        activeCurrency = sp.currency;
        sectionSwitch = true;
        break;
      }
    }
    if (sectionSwitch) continue;

    if (pageHeaderRe && pageHeaderRe.test(trimmed)) continue;
    if (shouldSkipLine(trimmed, skipPatterns)) continue;

    const dateResult = parseDateFromLine(trimmed, dateFormats);
    if (!dateResult) continue;

    // Collect continuation lines
    const txLines: string[] = [dateResult.rest];
    while (i < lines.length) {
      const nextTrimmed = lines[i].trim();
      if (!nextTrimmed) { i++; continue; }
      // Stop if next line has a date, section switch, or skip pattern
      if (parseDateFromLine(nextTrimmed, dateFormats)) break;
      let isSectionSwitch = false;
      for (const sp of sectionPatterns) {
        if (compilePattern(sp.pattern).test(nextTrimmed)) { isSectionSwitch = true; break; }
      }
      if (isSectionSwitch) break;
      if (shouldSkipLine(nextTrimmed, skipPatterns)) { i++; continue; }
      txLines.push(nextTrimmed);
      i++;
    }

    const fullText = txLines.join(' ');

    // Apply description cleanup
    let processedText = fullText;
    for (const re of descCleanupRes) {
      processedText = processedText.replace(re, ' ').trim();
    }

    // For prefix-based amounts (like Santander bank with $ and U$S)
    if (processedText.includes('$')) {
      // Try currency-prefixed extraction
      const currencyAmounts = extractCurrencyPrefixedAmounts(processedText);
      if (currencyAmounts.length >= 2) {
        // Last is balance, rest are transactions
        const txAmts = template.hasBalanceColumn
          ? currencyAmounts.slice(0, -1)
          : currencyAmounts;

        const firstDollarIdx = processedText.search(/[-]?\s*(?:U?\$)/);
        let description = firstDollarIdx >= 0
          ? processedText.slice(0, firstDollarIdx).trim()
          : processedText.trim();
        description = cleanDescription(description);

        for (const ta of txAmts) {
          if (ta.amount === 0) continue;
          transactions.push({ date: dateResult.date, description, amount: ta.amount, currency: ta.currency });
        }
        continue;
      }
    }

    // Fall back to standard amount extraction
    const amounts = extractAmounts(processedText, amountRe);
    if (amounts.length === 0) continue;

    let txAmounts = amounts;
    if (template.hasBalanceColumn && txAmounts.length >= 2) {
      txAmounts = txAmounts.slice(0, -1);
    }

    const firstAmtIdx = processedText.indexOf(txAmounts[0]);
    const description = cleanDescription(processedText.slice(0, firstAmtIdx));

    for (const amtStr of txAmounts) {
      const amt = parseAndSign(amtStr, template);
      if (amt !== null) {
        transactions.push({ date: dateResult.date, description, amount: amt, currency: activeCurrency });
      }
    }
  }

  return transactions;
}

// ─── Currency-prefixed amount extraction ────────────────────────────────────────

function extractCurrencyPrefixedAmounts(
  text: string
): { currency: 'ARS' | 'USD'; amount: number }[] {
  const re = new RegExp(CURRENCY_AMOUNT_RE.source, 'g');
  const results: { currency: 'ARS' | 'USD'; amount: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const raw = match[1];
    const isUSD = raw.includes('U$S');
    const cleaned = raw.replace(/U\$S/g, '').replace(/\$/g, '').trim();
    const amt = parseLatamAmount(cleaned);
    if (!isNaN(amt)) {
      results.push({ currency: isUSD ? 'USD' : 'ARS', amount: amt });
    }
  }

  return results;
}

// ─── Template validation ────────────────────────────────────────────────────────

export interface TemplateValidationError {
  field: string;
  message: string;
}

/** Validate a template configuration before saving. */
export function validateTemplate(template: Partial<ParserTemplate>): TemplateValidationError[] {
  const errors: TemplateValidationError[] = [];

  if (!template.label?.trim()) errors.push({ field: 'label', message: 'Se requiere un nombre' });
  if (!template.institution?.trim()) errors.push({ field: 'institution', message: 'Se requiere la institución' });
  // documentType is optional — auto-inferred from negateAmounts if not provided
  if (!template.dateFormat) errors.push({ field: 'dateFormat', message: 'Se requiere el formato de fecha' });
  if (!template.defaultCurrency) errors.push({ field: 'defaultCurrency', message: 'Se requiere la moneda' });

  // Validate fingerprints are valid regexes
  for (const fp of template.fingerprints || []) {
    try { compilePattern(fp); } catch {
      errors.push({ field: 'fingerprints', message: `Patrón inválido: ${fp}` });
    }
  }

  // Validate skip patterns are valid regexes
  for (const sp of template.skipPatterns || []) {
    try { compilePattern(sp); } catch {
      errors.push({ field: 'skipPatterns', message: `Patrón inválido: ${sp}` });
    }
  }

  return errors;
}

// ─── Template testing ───────────────────────────────────────────────────────────

/**
 * Test a template against PDF text and return a preview of parsed transactions.
 * Used in the template builder UI to give real-time feedback.
 */
export function testTemplate(
  template: ParserTemplate,
  text: string
): { transactions: RawParsedTransaction[]; lineCount: number; sectionFound: boolean } {
  const sectionText = extractSectionText(text, template);
  const lineCount = sectionText ? sectionText.split('\n').length : 0;
  const sectionFound = sectionText.length > 0;

  let transactions: RawParsedTransaction[] = [];
  try {
    transactions = executeTemplate(template, text);
  } catch {
    // Return empty on error
  }

  return { transactions, lineCount, sectionFound };
}
