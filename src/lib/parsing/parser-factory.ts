import { getBankSource } from '@/config/banks';
import type { RawParsedTransaction } from '@/lib/db/types';

const PARSER_SERVICE_URL = process.env.PARSER_SERVICE_URL || 'http://localhost:8080';

/**
 * Call the Python parsing service to extract transactions from a file.
 * The parser service is a Cloud Function (Gen2) or standalone FastAPI service.
 */
export async function parseFile(
  fileBuffer: Buffer,
  fileName: string,
  sourceId: string
): Promise<{ period: string; transactions: RawParsedTransaction[] }> {
  const source = getBankSource(sourceId);
  if (!source) {
    throw new Error(`Unknown source: ${sourceId}`);
  }

  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(fileBuffer)]), fileName);
  formData.append('parser_key', source.parserKey);
  formData.append('source_id', sourceId);

  const response = await fetch(`${PARSER_SERVICE_URL}/parse`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(30000), // 30s timeout for cold starts
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
      currency: String(tx.currency || source.currencies[0] || 'ARS'),
    })),
  };
}

/**
 * For local development / testing: parse a CSV directly in TypeScript
 * without calling the Python service.
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
        : config.defaultCurrency || 'ARS') as 'ARS' | 'USD' | 'UYU',
    });
  }

  return transactions;
}
