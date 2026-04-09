import { getBankSource, AVAILABLE_PARSERS } from '@/config/banks';
import type { RawParsedTransaction, Currency } from '@/lib/db/types';

const PARSER_SERVICE_URL = process.env.PARSER_SERVICE_URL;

/**
 * Resolve a sourceId or parserKey to a valid parser key.
 */
function resolveParserKey(sourceIdOrParserKey: string): string {
  const source = getBankSource(sourceIdOrParserKey);
  if (source) return source.parserKey;

  const parser = AVAILABLE_PARSERS.find((p) => p.key === sourceIdOrParserKey);
  if (parser) return parser.key;

  throw new Error(`Unknown source or parser: ${sourceIdOrParserKey}`);
}

/**
 * Parse a file. Routes to the right parser:
 * - CSV/TSV: parsed locally in TypeScript (no external service needed)
 * - XLSX/XLS: parsed locally with basic extraction
 * - PDF + bank-specific: requires Python parser service
 */
export async function parseFile(
  fileBuffer: Buffer,
  fileName: string,
  sourceId: string
): Promise<{ period: string; transactions: RawParsedTransaction[] }> {
  const parserKey = resolveParserKey(sourceId);
  const ext = fileName.split('.').pop()?.toLowerCase();

  // CSV/TSV: parse locally
  if (parserKey === 'generic_csv' || ext === 'csv' || ext === 'tsv') {
    const delimiter = ext === 'tsv' ? '\t' : ',';
    const content = fileBuffer.toString('utf-8');
    const transactions = parseCSVAuto(content, delimiter);
    const period = inferPeriod(transactions);
    return { period, transactions };
  }

  // XLSX/XLS: parse locally with basic extraction
  if (parserKey === 'generic_xlsx' || ext === 'xlsx' || ext === 'xls') {
    // For now, try to read as CSV (some "xlsx" exports are actually CSV)
    try {
      const content = fileBuffer.toString('utf-8');
      if (content.includes(',') || content.includes('\t')) {
        const transactions = parseCSVAuto(content, content.includes('\t') ? '\t' : ',');
        if (transactions.length > 0) {
          return { period: inferPeriod(transactions), transactions };
        }
      }
    } catch {
      // Not text-based, fall through to Python service
    }

    // Real XLSX needs the Python service
    if (!PARSER_SERVICE_URL) {
      throw new Error(
        'Los archivos Excel requieren el servicio de parseo (no configurado). ' +
        'Convertí el archivo a CSV e importalo como CSV genérico.'
      );
    }
    return callParserService(fileBuffer, fileName, parserKey, sourceId);
  }

  // PDF and bank-specific: requires Python service
  if (!PARSER_SERVICE_URL) {
    throw new Error(
      'Los archivos PDF requieren el servicio de parseo (no configurado). ' +
      'Convertí el archivo a CSV e importalo como CSV genérico.'
    );
  }
  return callParserService(fileBuffer, fileName, parserKey, sourceId);
}

/**
 * Call the external Python parser service.
 */
async function callParserService(
  fileBuffer: Buffer,
  fileName: string,
  parserKey: string,
  sourceId: string
): Promise<{ period: string; transactions: RawParsedTransaction[] }> {
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(fileBuffer)]), fileName);
  formData.append('parser_key', parserKey);
  formData.append('source_id', sourceId);

  const response = await fetch(`${PARSER_SERVICE_URL}/parse`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => 'Unknown error');
    throw new Error(`Parser service error (${response.status}): ${error}`);
  }

  const result = await response.json();

  return {
    period: result.period || '',
    transactions: (result.transactions || []).map((tx: Record<string, unknown>) => ({
      date: String(tx.date),
      description: String(tx.description),
      amount: Number(tx.amount),
      currency: String(tx.currency || 'ARS'),
    })),
  };
}

// ─── Column detection heuristics ────────────────────────────────────────────

const DATE_PATTERNS = [
  /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/,  // DD/MM/YYYY, MM-DD-YY, etc.
  /^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/,      // YYYY-MM-DD
  /^\d{1,2}\s+\w{3,}\s+\d{2,4}$/,                // 15 Mar 2025
];

const DATE_HEADER_NAMES = ['fecha', 'date', 'dia', 'día', 'fch', 'fec'];
const DESC_HEADER_NAMES = ['descripcion', 'descripción', 'concepto', 'detalle', 'description', 'detail', 'movimiento', 'referencia'];
const AMOUNT_HEADER_NAMES = ['monto', 'importe', 'amount', 'valor', 'débito', 'debito', 'credito', 'crédito', 'total', 'cargo'];
const CURRENCY_HEADER_NAMES = ['moneda', 'currency', 'divisa', 'mon'];

function normalizeHeader(h: string): string {
  return h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function looksLikeDate(val: string): boolean {
  return DATE_PATTERNS.some((p) => p.test(val.trim()));
}

function looksLikeAmount(val: string): boolean {
  const clean = val.replace(/[\s$ARS USD UYU]/g, '').trim();
  return /^-?[\d.,]+$/.test(clean) && clean.length > 0;
}

interface ColumnMap {
  dateCol: number;
  descCol: number;
  amountCol: number;
  currencyCol: number | null;
}

/**
 * Auto-detect column roles from CSV header + first few data rows.
 */
function detectColumns(header: string[], dataRows: string[][]): ColumnMap | null {
  const normalized = header.map(normalizeHeader);

  // Try header-name matching first
  let dateCol = normalized.findIndex((h) => DATE_HEADER_NAMES.some((n) => h.includes(n)));
  let descCol = normalized.findIndex((h) => DESC_HEADER_NAMES.some((n) => h.includes(n)));
  let amountCol = normalized.findIndex((h) => AMOUNT_HEADER_NAMES.some((n) => h.includes(n)));
  let currencyCol: number | null = normalized.findIndex((h) => CURRENCY_HEADER_NAMES.some((n) => h.includes(n)));
  if (currencyCol === -1) currencyCol = null;

  // If header matching found all three, we're done
  if (dateCol >= 0 && descCol >= 0 && amountCol >= 0) {
    return { dateCol, descCol, amountCol, currencyCol };
  }

  // Fallback: analyze data rows to infer column types
  if (dataRows.length === 0) return null;

  const colCount = Math.max(header.length, ...dataRows.map((r) => r.length));
  const dateScores = new Array(colCount).fill(0);
  const amountScores = new Array(colCount).fill(0);
  const textLengths = new Array(colCount).fill(0);

  const sampleRows = dataRows.slice(0, Math.min(10, dataRows.length));
  for (const row of sampleRows) {
    for (let c = 0; c < row.length; c++) {
      const val = row[c];
      if (looksLikeDate(val)) dateScores[c]++;
      if (looksLikeAmount(val)) amountScores[c]++;
      textLengths[c] += val.length;
    }
  }

  if (dateCol < 0) dateCol = dateScores.indexOf(Math.max(...dateScores));
  if (amountCol < 0) {
    // Pick the column with highest amount score that isn't the date column
    let bestScore = 0;
    for (let c = 0; c < colCount; c++) {
      if (c !== dateCol && amountScores[c] > bestScore) {
        bestScore = amountScores[c];
        amountCol = c;
      }
    }
  }
  if (descCol < 0) {
    // Pick the column with the longest average text that isn't date or amount
    let bestLen = 0;
    for (let c = 0; c < colCount; c++) {
      if (c !== dateCol && c !== amountCol && textLengths[c] > bestLen) {
        bestLen = textLengths[c];
        descCol = c;
      }
    }
  }

  if (dateCol >= 0 && descCol >= 0 && amountCol >= 0) {
    return { dateCol, descCol, amountCol, currencyCol };
  }

  return null;
}

/**
 * Parse a CSV with auto-detected columns.
 * Handles: standard CSV, semicolon-separated, tab-separated.
 * Detects date/description/amount columns from headers and data patterns.
 */
function parseCSVAuto(content: string, defaultDelimiter: string): RawParsedTransaction[] {
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Detect delimiter: try the one with most consistent column counts
  const delimiters = [defaultDelimiter, ';', ',', '\t'].filter((d, i, arr) => arr.indexOf(d) === i);
  let bestDelimiter = defaultDelimiter;
  let bestConsistency = 0;

  for (const d of delimiters) {
    const counts = lines.slice(0, 10).map((l) => l.split(d).length);
    const mode = counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)];
    if (mode > 1) {
      const consistent = counts.filter((c) => c === mode).length;
      if (consistent > bestConsistency || (consistent === bestConsistency && mode > lines[0].split(bestDelimiter).length)) {
        bestConsistency = consistent;
        bestDelimiter = d;
      }
    }
  }

  const splitLine = (line: string) =>
    line.split(bestDelimiter).map((c) => c.trim().replace(/^"|"$/g, ''));

  const header = splitLine(lines[0]);
  const dataRows = lines.slice(1).map(splitLine);

  const colMap = detectColumns(header, dataRows);
  if (!colMap) {
    throw new Error(
      'No se pudieron detectar las columnas automáticamente. ' +
      'El archivo debe tener columnas de fecha, descripción y monto.'
    );
  }

  const transactions: RawParsedTransaction[] = [];

  for (const cols of dataRows) {
    if (cols.length <= Math.max(colMap.dateCol, colMap.descCol, colMap.amountCol)) continue;

    const dateStr = cols[colMap.dateCol]?.trim();
    const desc = cols[colMap.descCol]?.trim();
    const amountStr = cols[colMap.amountCol]?.replace(/[^\d.,-]/g, '').trim();

    if (!dateStr || !desc || !amountStr) continue;

    // Parse amount: handle both . and , as decimal separators
    let amount: number;
    if (amountStr.includes(',') && amountStr.includes('.')) {
      // 1.234,56 or 1,234.56 — figure out which is decimal
      const lastComma = amountStr.lastIndexOf(',');
      const lastDot = amountStr.lastIndexOf('.');
      if (lastComma > lastDot) {
        amount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
      } else {
        amount = parseFloat(amountStr.replace(/,/g, ''));
      }
    } else if (amountStr.includes(',')) {
      amount = parseFloat(amountStr.replace(',', '.'));
    } else {
      amount = parseFloat(amountStr);
    }

    if (isNaN(amount)) continue;

    // Detect currency from column or from amount string
    let currency: Currency = 'ARS';
    if (colMap.currencyCol !== null && cols[colMap.currencyCol]) {
      const cur = cols[colMap.currencyCol].toUpperCase().trim();
      if (cur === 'USD' || cur === 'UYU' || cur === 'ARS') currency = cur;
      else if (cur.includes('DOLAR') || cur.includes('USD') || cur === 'U$S') currency = 'USD';
      else if (cur.includes('PESO') && cur.includes('URU')) currency = 'UYU';
    }

    transactions.push({ date: dateStr, description: desc, amount, currency });
  }

  return transactions;
}

/**
 * Infer the period (YYYY-MM) from parsed transactions.
 */
function inferPeriod(transactions: RawParsedTransaction[]): string {
  if (transactions.length === 0) return '';

  // Try to parse dates and find the most common month
  const months: Record<string, number> = {};
  for (const tx of transactions) {
    // Try common date formats
    const match = tx.date.match(/(\d{4})[\/\-.](\d{1,2})/) || // YYYY-MM
      tx.date.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/); // DD/MM/YYYY

    if (match) {
      let period: string;
      if (match[3]) {
        // DD/MM/YYYY format
        period = `${match[3]}-${match[2].padStart(2, '0')}`;
      } else {
        // YYYY-MM format
        period = `${match[1]}-${match[2].padStart(2, '0')}`;
      }
      months[period] = (months[period] || 0) + 1;
    }
  }

  // Return the most common period
  const sorted = Object.entries(months).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || '';
}

/**
 * Legacy: parse a CSV with explicit column config.
 */
export function parseCSVLocally(
  content: string,
  config: {
    dateColumn: number;
    descriptionColumn: number;
    amountColumn: number;
    currencyColumn?: number;
    defaultCurrency?: string;
    delimiter?: string;
    skipHeader?: boolean;
    dateFormat?: string;
  }
): RawParsedTransaction[] {
  const delimiter = config.delimiter || ',';
  const lines = content.split('\n').filter((l) => l.trim());
  const startIdx = config.skipHeader !== false ? 1 : 0;
  const transactions: RawParsedTransaction[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < Math.max(config.dateColumn, config.descriptionColumn, config.amountColumn) + 1) {
      continue;
    }

    const amountStr = cols[config.amountColumn].replace(/[^\d.,-]/g, '');
    const amount = parseFloat(amountStr.replace(',', '.'));
    if (isNaN(amount)) continue;

    transactions.push({
      date: cols[config.dateColumn],
      description: cols[config.descriptionColumn],
      amount,
      currency: (config.currencyColumn !== undefined
        ? cols[config.currencyColumn]
        : config.defaultCurrency || 'ARS') as Currency,
    });
  }

  return transactions;
}
