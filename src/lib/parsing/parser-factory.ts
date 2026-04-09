import { getBankSource, AVAILABLE_PARSERS } from '@/config/banks';
import type { RawParsedTransaction, Currency } from '@/lib/db/types';
import { parsePDFText, parsePDFTextAutoDetect } from './pdf-parsers';
import { getParserTemplates } from '@/lib/db/parser-templates';
import { templateToPlugin } from './template-parser';
import { parseItauBankXLS } from './plugins/itau-bank';

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
 * - PDF: TypeScript parsers (built-in plugins + household templates)
 */
export async function parseFile(
  fileBuffer: Buffer,
  fileName: string,
  sourceId: string,
  householdId?: string
): Promise<{ period: string; transactions: RawParsedTransaction[] }> {
  const parserKey = resolveParserKey(sourceId);
  const ext = fileName.split('.').pop()?.toLowerCase();

  // PDF: extract text with pdf-parse, then use TypeScript parsers
  if (ext === 'pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const pdfData = await pdfParse(fileBuffer);

    // For generic parser keys, auto-detect the best parser (built-in + templates)
    let transactions: RawParsedTransaction[];
    if (parserKey === 'generic_csv' || parserKey === 'generic_xlsx') {
      transactions = parsePDFTextAutoDetect(pdfData.text);

      // If built-in parsers didn't match, try household templates
      if (transactions.length === 0 && householdId) {
        transactions = await tryHouseholdTemplates(householdId, pdfData.text);
      }

      if (transactions.length === 0) {
        throw new Error(
          'No se pudo detectar el formato del PDF automáticamente. ' +
          'Podés crear un template de parseo para este formato desde Configuración.'
        );
      }
    } else if (parserKey.startsWith('template_')) {
      // User selected a specific household template
      transactions = await parseWithTemplate(householdId || '', parserKey, pdfData.text);
    } else {
      transactions = parsePDFText(pdfData.text, parserKey);
    }

    const period = inferPeriod(transactions);
    return { period, transactions };
  }

  // CSV/TSV: parse locally
  if (parserKey === 'generic_csv' || ext === 'csv' || ext === 'tsv') {
    const delimiter = ext === 'tsv' ? '\t' : ',';
    const content = fileBuffer.toString('utf-8');
    const transactions = parseCSVAuto(content, delimiter);
    const period = inferPeriod(transactions);
    return { period, transactions };
  }

  // XLSX/XLS: parse locally with xlsx library
  if (parserKey === 'generic_xlsx' || ext === 'xlsx' || ext === 'xls') {
    // Try bank-specific XLS parser first
    if (parserKey === 'itau_bank') {
      const transactions = await parseItauBankXLS(fileBuffer);
      return { period: inferPeriod(transactions), transactions };
    }

    // Generic XLS: try Itaú auto-detection, then generic extraction
    const itauResult = await parseItauBankXLS(fileBuffer);
    if (itauResult.length > 0) {
      return { period: inferPeriod(itauResult), transactions: itauResult };
    }

    // Generic XLS: use xlsx to extract as CSV-like data
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (sheet) {
        const csv = XLSX.utils.sheet_to_csv(sheet);
        const transactions = parseCSVAuto(csv, ',');
        if (transactions.length > 0) {
          return { period: inferPeriod(transactions), transactions };
        }
      }
    } catch {
      // xlsx parsing failed
    }

    // Last resort: try as text (some "xls" files are actually CSV)
    try {
      const content = fileBuffer.toString('utf-8');
      if (content.includes(',') || content.includes('\t')) {
        const transactions = parseCSVAuto(content, content.includes('\t') ? '\t' : ',');
        if (transactions.length > 0) {
          return { period: inferPeriod(transactions), transactions };
        }
      }
    } catch {
      // Not text-based
    }

    throw new Error(
      'No se pudieron extraer transacciones del archivo Excel. ' +
      'Probá exportándolo como CSV e importándolo como CSV genérico.'
    );
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
  /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/,   // DD/MM/YYYY, MM-DD-YY, etc.
  /^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/,       // YYYY-MM-DD
  /^\d{1,2}\s+\w{3,}\s+\d{2,4}$/,                 // 15 Mar 2025
  /^\d{1,2}[\/\-]\w{3}[\/\-]\d{2,4}$/,            // 15/Mar/2025, 15-Mar-25
  /^\d{8}$/,                                        // 20250315 (compact)
];

const DATE_HEADER_NAMES = [
  'fecha', 'date', 'dia', 'día', 'fch', 'fec', 'fecha operacion',
  'fecha_operacion', 'fecha mov', 'fecha movimiento', 'fecha valor',
  'fecha contable', 'f. operacion', 'fec. mov',
];
const DESC_HEADER_NAMES = [
  'descripcion', 'descripción', 'concepto', 'detalle', 'description',
  'detail', 'movimiento', 'referencia', 'leyenda', 'comercio',
  'establecimiento', 'comprobante', 'obs', 'observacion', 'motivo',
  'glosa', 'nota', 'operacion',
];
const AMOUNT_HEADER_NAMES = [
  'monto', 'importe', 'amount', 'valor', 'débito', 'debito', 'credito',
  'crédito', 'total', 'cargo', 'abono', 'haber', 'debe', 'pesos',
  'dolares', 'dólares', 'monto pesos', 'monto dolares', 'imp',
];
const CURRENCY_HEADER_NAMES = ['moneda', 'currency', 'divisa', 'mon', 'tipo moneda'];

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-\.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeDate(val: string): boolean {
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > 30) return false;
  return DATE_PATTERNS.some((p) => p.test(trimmed));
}

function looksLikeAmount(val: string): boolean {
  const clean = val.replace(/[\s$ARSUYI]/g, '').trim();
  if (!clean || clean.length > 20) return false;
  return /^-?[\d.,]+$/.test(clean) && /\d/.test(clean);
}

interface ColumnMap {
  dateCol: number;
  descCol: number;
  amountCol: number;
  currencyCol: number | null;
  headerRowIndex: number;
}

/**
 * Auto-detect column roles from a candidate header + data rows.
 */
function detectColumnsFromRows(header: string[], dataRows: string[][]): Omit<ColumnMap, 'headerRowIndex'> | null {
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
  if (colCount < 2) return null; // need at least 2 columns

  const dateScores = new Array(colCount).fill(0);
  const amountScores = new Array(colCount).fill(0);
  const textLengths = new Array(colCount).fill(0);
  const nonEmptyCounts = new Array(colCount).fill(0);

  const sampleRows = dataRows.slice(0, Math.min(15, dataRows.length));
  for (const row of sampleRows) {
    for (let c = 0; c < Math.min(row.length, colCount); c++) {
      const val = row[c] || '';
      if (val.trim()) nonEmptyCounts[c]++;
      if (looksLikeDate(val)) dateScores[c]++;
      if (looksLikeAmount(val)) amountScores[c]++;
      textLengths[c] += val.length;
    }
  }

  // Date column: highest date score, must be > 0
  if (dateCol < 0) {
    const maxDateScore = Math.max(...dateScores);
    if (maxDateScore > 0) {
      dateCol = dateScores.indexOf(maxDateScore);
    }
  }

  // Amount column: highest amount score excluding the date column
  if (amountCol < 0) {
    let bestScore = 0;
    for (let c = 0; c < colCount; c++) {
      if (c !== dateCol && amountScores[c] > bestScore) {
        bestScore = amountScores[c];
        amountCol = c;
      }
    }
  }

  // Description column: longest text column that isn't date or amount
  if (descCol < 0) {
    let bestLen = 0;
    for (let c = 0; c < colCount; c++) {
      if (c !== dateCol && c !== amountCol && textLengths[c] > bestLen) {
        bestLen = textLengths[c];
        descCol = c;
      }
    }
  }

  // Accept if we found at least amount + description (date can be absent in some formats)
  if (amountCol >= 0 && descCol >= 0) {
    return { dateCol: dateCol >= 0 ? dateCol : -1, descCol, amountCol, currencyCol };
  }

  return null;
}

/**
 * Find the header row in a CSV. Bank CSVs often have metadata rows first.
 * Strategy: try each of the first 15 rows as a candidate header.
 * The header is the row where column-name matching works best, or
 * where subsequent rows have the most consistent column patterns.
 */
function findHeaderAndColumns(
  allRows: string[][],
  minDataRows: number = 2
): ColumnMap | null {
  const maxHeaderSearch = Math.min(15, allRows.length - minDataRows);

  // Score each candidate header row
  let bestResult: ColumnMap | null = null;
  let bestScore = -1;

  for (let h = 0; h < maxHeaderSearch; h++) {
    const header = allRows[h];
    const dataRows = allRows.slice(h + 1);

    // Skip rows that look like data (first cell is a date)
    // unless we haven't found anything yet
    const result = detectColumnsFromRows(header, dataRows);
    if (!result) continue;

    // Score: header-matched columns are worth more than inferred ones
    const normalized = header.map(normalizeHeader);
    let score = 0;

    // Bonus for header name matches
    if (DATE_HEADER_NAMES.some((n) => normalized.some((h2) => h2.includes(n)))) score += 10;
    if (DESC_HEADER_NAMES.some((n) => normalized.some((h2) => h2.includes(n)))) score += 10;
    if (AMOUNT_HEADER_NAMES.some((n) => normalized.some((h2) => h2.includes(n)))) score += 10;

    // Bonus for more data rows
    score += Math.min(dataRows.length, 20);

    // Bonus for having a date column
    if (result.dateCol >= 0) score += 5;

    if (score > bestScore) {
      bestScore = score;
      bestResult = { ...result, headerRowIndex: h };
    }
  }

  return bestResult;
}

/**
 * Parse a CSV with auto-detected columns.
 * Handles: standard CSV, semicolon-separated, tab-separated.
 * Handles: BOM, metadata header rows, various date/amount formats.
 */
function parseCSVAuto(content: string, defaultDelimiter: string): RawParsedTransaction[] {
  // Strip BOM
  let cleaned = content.replace(/^\uFEFF/, '');
  // Normalize line endings
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines = cleaned.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Detect delimiter: try each and pick the one with most consistent column counts
  const delimiters = [defaultDelimiter, ';', ',', '\t'].filter((d, i, arr) => arr.indexOf(d) === i);
  let bestDelimiter = defaultDelimiter;
  let bestConsistency = 0;
  let bestMode = 0;

  for (const d of delimiters) {
    const counts = lines.slice(0, 15).map((l) => l.split(d).length);
    const sorted = [...counts].sort((a, b) => a - b);
    const mode = sorted[Math.floor(sorted.length / 2)];
    if (mode > 1) {
      const consistent = counts.filter((c) => c === mode).length;
      if (consistent > bestConsistency || (consistent === bestConsistency && mode > bestMode)) {
        bestConsistency = consistent;
        bestMode = mode;
        bestDelimiter = d;
      }
    }
  }

  const splitLine = (line: string) => {
    // Handle quoted fields properly
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === bestDelimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const allRows = lines.map(splitLine);

  // Find header row and column mapping
  const colMap = findHeaderAndColumns(allRows);
  if (!colMap) {
    throw new Error(
      'No se pudieron detectar las columnas automáticamente. ' +
      'Verificá que el archivo tenga columnas de fecha, descripción y monto.'
    );
  }

  const dataRows = allRows.slice(colMap.headerRowIndex + 1);
  const transactions: RawParsedTransaction[] = [];

  for (const cols of dataRows) {
    const minCol = Math.max(colMap.descCol, colMap.amountCol, colMap.dateCol);
    if (cols.length <= minCol) continue;

    const dateStr = colMap.dateCol >= 0 ? (cols[colMap.dateCol]?.trim() || '') : '';
    const desc = cols[colMap.descCol]?.trim() || '';
    const rawAmount = cols[colMap.amountCol] || '';
    const amountStr = rawAmount.replace(/[^\d.,-]/g, '').trim();

    if (!desc || !amountStr) continue;

    // Parse amount: handle both . and , as decimal separators
    let amount: number;
    if (amountStr.includes(',') && amountStr.includes('.')) {
      const lastComma = amountStr.lastIndexOf(',');
      const lastDot = amountStr.lastIndexOf('.');
      if (lastComma > lastDot) {
        // 1.234,56 — European/LATAM format
        amount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
      } else {
        // 1,234.56 — US format
        amount = parseFloat(amountStr.replace(/,/g, ''));
      }
    } else if (amountStr.includes(',')) {
      // Could be 1234,56 or 1,234 — check position
      const parts = amountStr.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        // Decimal comma: 1234,56
        amount = parseFloat(amountStr.replace(',', '.'));
      } else {
        // Thousands comma: 1,234
        amount = parseFloat(amountStr.replace(/,/g, ''));
      }
    } else {
      amount = parseFloat(amountStr);
    }

    if (isNaN(amount) || amount === 0) continue;

    // Detect currency
    let currency: Currency = 'ARS';
    if (colMap.currencyCol !== null && cols[colMap.currencyCol]) {
      const cur = cols[colMap.currencyCol].toUpperCase().trim();
      if (cur === 'USD' || cur === 'UYU' || cur === 'ARS') currency = cur;
      else if (cur.includes('DOLAR') || cur.includes('USD') || cur === 'U$S') currency = 'USD';
      else if (cur.includes('PESO') && cur.includes('URU')) currency = 'UYU';
    }

    // Use date or fallback to today
    const finalDate = dateStr || new Date().toISOString().slice(0, 10);

    transactions.push({ date: finalDate, description: desc, amount, currency });
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

// ─── Household template helpers ─────────────────────────────────────────────

/**
 * Try all household parser templates against PDF text.
 * Returns transactions from the best-matching template.
 */
async function tryHouseholdTemplates(
  householdId: string,
  pdfText: string
): Promise<RawParsedTransaction[]> {
  try {
    const templates = await getParserTemplates(householdId);
    if (templates.length === 0) return [];

    let best: RawParsedTransaction[] = [];
    for (const template of templates) {
      try {
        const plugin = templateToPlugin(template);
        // Check fingerprints first
        const fingerprints = template.fingerprints.map((f) => new RegExp(f, 'i'));
        const matches = fingerprints.some((fp) => fp.test(pdfText));
        if (!matches && fingerprints.length > 0) continue;

        const result = plugin.parse(pdfText);
        if (result.length > best.length) {
          best = result;
        }
      } catch {
        // template failed, try next
      }
    }
    return best;
  } catch {
    // Firestore error, skip template matching
    return [];
  }
}

/**
 * Parse PDF text using a specific household template (by key like "template_abc123").
 */
async function parseWithTemplate(
  householdId: string,
  templateKey: string,
  pdfText: string
): Promise<RawParsedTransaction[]> {
  const templateId = templateKey.replace('template_', '');
  const templates = await getParserTemplates(householdId);
  const template = templates.find((t) => t.id === templateId);
  if (!template) {
    throw new Error(`Template de parseo no encontrado: ${templateId}`);
  }
  const plugin = templateToPlugin(template);
  return plugin.parse(pdfText);
}
