import type { ParserPlugin } from '../parser-registry';
import type { RawParsedTransaction } from '@/lib/db/types';

/**
 * Itaú Bank Account (Uruguay) — XLS parser.
 *
 * File format: binary .xls with sheet "Estado de Cuenta"
 * Layout:
 *   Row 4: account metadata (name, type, currency, number)
 *   Row 7: headers — Fecha | Concepto | (empty) | Débito | Crédito | Saldo | Referencia | Destino
 *   Row 8+: transactions
 *   Last row: SALDO FINAL
 *
 * Amounts use dot decimal, no thousands separator.
 * Dates are DD/MM/YYYY.
 * Debits and credits are in separate columns.
 */
export const itauBank: ParserPlugin = {
  key: 'itau_bank',
  label: 'Itaú – Cuenta Bancaria (UY)',
  institution: 'Itaú',
  documentType: 'Cuenta Bancaria',
  fingerprints: [
    /Ita[úu]/i,
    /Estado de Cuenta/i,
    /Caja de Ahorro/i,
  ],
  parse(_text: string): RawParsedTransaction[] {
    // This parser works on the raw XLS buffer, not extracted text.
    // See parseItauBankXLS() below for the actual implementation.
    // The text-based parse is a no-op; routing is handled in parser-factory.
    return [];
  },
};

/**
 * Parse an Itaú bank XLS buffer directly.
 * Called from parser-factory.ts for .xls files matching itau_bank.
 */
export async function parseItauBankXLS(buffer: Buffer): Promise<RawParsedTransaction[]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];

  // Convert to array of arrays (raw rows)
  const rows: (string | number | undefined)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: undefined,
    raw: true,
  });

  // Detect currency from metadata row (row index 4, 0-based: 3)
  let currency: 'ARS' | 'USD' | 'UYU' = 'USD'; // Itaú Uruguay default
  for (let r = 0; r < Math.min(6, rows.length); r++) {
    const row = rows[r];
    if (!row) continue;
    const monedaIdx = row.findIndex((c) => typeof c === 'string' && /moneda/i.test(c));
    if (monedaIdx >= 0 && row[monedaIdx + 1]) {
      const cur = String(row[monedaIdx + 1]).toLowerCase();
      if (cur.includes('peso') || cur.includes('uyu')) currency = 'UYU';
      else if (cur.includes('dólar') || cur.includes('dolar') || cur.includes('usd')) currency = 'USD';
      else if (cur.includes('ars')) currency = 'ARS';
    }
  }

  // Find the header row (has "Fecha" and "Concepto" or "Débito")
  let headerRow = -1;
  let dateCol = -1;
  let conceptCol = -1;
  let debitCol = -1;
  let creditCol = -1;

  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const row = rows[r];
    if (!row) continue;

    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').toLowerCase().trim();
      if (val === 'fecha') dateCol = c;
      if (val === 'concepto') conceptCol = c;
      if (val.includes('bito') || val.includes('debito') || val === 'débito') debitCol = c;
      if (val.includes('dito') || val.includes('credito') || val === 'crédito') creditCol = c;
    }

    if (dateCol >= 0 && (debitCol >= 0 || creditCol >= 0)) {
      headerRow = r;
      break;
    }
  }

  if (headerRow < 0) return [];
  // If we didn't find a separate concept column, assume it's dateCol + 1
  if (conceptCol < 0) conceptCol = dateCol + 1;

  const SKIP_RE = /SALDO ANTERIOR|SALDO FINAL|SALDO INICIAL/i;

  const transactions: RawParsedTransaction[] = [];

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    // Parse date
    let dateStr = '';
    const dateVal = row[dateCol];
    if (dateVal === undefined || dateVal === null || dateVal === '') continue;

    if (typeof dateVal === 'number') {
      // Excel serial date number
      const d = XLSX.SSF.parse_date_code(dateVal);
      if (d) {
        dateStr = `${String(d.d).padStart(2, '0')}/${String(d.m).padStart(2, '0')}/${String(d.y).slice(-2)}`;
      }
    } else {
      dateStr = String(dateVal).trim();
      // Convert DD/MM/YYYY to DD/MM/YY
      const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (m) {
        const yy = m[3].length === 4 ? m[3].slice(-2) : m[3];
        dateStr = `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${yy}`;
      }
    }
    if (!dateStr) continue;

    // Parse description
    const description = String(row[conceptCol] || '').trim();
    if (!description || SKIP_RE.test(description)) continue;

    // Parse amounts
    const debit = debitCol >= 0 ? toNumber(row[debitCol]) : 0;
    const credit = creditCol >= 0 ? toNumber(row[creditCol]) : 0;

    // Debit = money out (negative), Credit = money in (positive)
    const amount = credit > 0 ? credit : (debit > 0 ? -debit : 0);
    if (amount === 0) continue;

    transactions.push({ date: dateStr, description, amount, currency });
  }

  return transactions;
}

function toNumber(val: string | number | undefined): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  // Handle LATAM format if present
  const cleaned = String(val).replace(/\s/g, '').replace(/,/g, '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}
