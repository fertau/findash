import type { ParserPlugin } from '../parser-registry';
import {
  parseLatamAmount, extractAmounts, AMOUNT_RE,
  DATE_PATTERNS, resolveMonth, cleanDescription,
} from '../toolkit';

const SKIP_RE = /SU PAGO|SALDO ANTERIOR|SUBTOTAL|TOTAL|PERCEP|IVA|IMPUESTO|GANANCIAS|IMP\.|BIENES PERSONALES|SEG\.|SEGURO|CARGO FINANCIERO/i;

export const galiciaCard: ParserPlugin = {
  key: 'galicia_card',
  label: 'Galicia – Tarjeta (Visa/MC)',
  institution: 'Galicia',
  documentType: 'Tarjeta de Crédito',
  fingerprints: [
    /Banco de Galicia/i,
    /DETALLE DEL CONSUMO/i,
    /VISA|MASTERCARD/i,
  ],
  parse(text) {
    const transactions: ReturnType<ParserPlugin['parse']> = [];

    const detailStart = text.indexOf('DETALLE DEL CONSUMO');
    if (detailStart === -1) return transactions;

    const lines = text.slice(detailStart).split('\n');
    const VISA_DATE_RE = DATE_PATTERNS.dashDMY;
    const MC_DATE_RE = DATE_PATTERNS.dashDMonY;

    let i = 1;

    while (i < lines.length) {
      const line = lines[i].trim();
      i++;

      if (!line || SKIP_RE.test(line)) continue;

      let date: string | null = null;
      let rest = '';

      // Try Mastercard date first (more specific)
      const mcMatch = line.match(MC_DATE_RE);
      if (mcMatch) {
        const month = resolveMonth(mcMatch[2]);
        if (month) {
          date = `${mcMatch[1]}/${month}/${mcMatch[3]}`;
          rest = line.slice(mcMatch[0].length);
        }
      }

      // Try Visa date
      if (!date) {
        const visaMatch = line.match(VISA_DATE_RE);
        if (visaMatch) {
          date = `${visaMatch[1]}/${visaMatch[2]}/${visaMatch[3]}`;
          rest = line.slice(visaMatch[0].length);
        }
      }

      if (!date) continue;

      const descParts: string[] = [];
      let amounts: string[] = [];

      const lineAmounts = extractAmounts(rest, AMOUNT_RE);
      if (lineAmounts.length > 0) {
        const firstAmtIdx = rest.indexOf(lineAmounts[0]);
        descParts.push(rest.slice(0, firstAmtIdx).trim());
        amounts = lineAmounts;
      } else {
        descParts.push(rest.trim());
      }

      // Look ahead for continuation lines
      while (i < lines.length && amounts.length === 0) {
        const nextLine = lines[i].trim();
        if (!nextLine) { i++; continue; }
        if (VISA_DATE_RE.test(nextLine) || MC_DATE_RE.test(nextLine)) break;
        if (SKIP_RE.test(nextLine)) { i++; continue; }

        const nextAmounts = extractAmounts(nextLine, AMOUNT_RE);
        if (nextAmounts.length > 0) {
          const beforeAmt = nextLine.slice(0, nextLine.indexOf(nextAmounts[0])).trim();
          if (beforeAmt && !/^\d{3,}$/.test(beforeAmt)) descParts.push(beforeAmt);
          amounts = nextAmounts;
          i++;
          break;
        }
        if (!/^\d{3,}$/.test(nextLine)) descParts.push(nextLine);
        i++;
      }

      // Skip trailing comprobante lines
      while (i < lines.length) {
        const nextLine = lines[i].trim();
        if (!nextLine) { i++; continue; }
        if (VISA_DATE_RE.test(nextLine) || MC_DATE_RE.test(nextLine) || SKIP_RE.test(nextLine)) break;
        if (/^\d{3,}$/.test(nextLine)) { i++; continue; }
        break;
      }

      if (amounts.length === 0) continue;

      const description = cleanDescription(descParts.join(' '));

      if (amounts.length >= 2) {
        const pesosAmt = parseLatamAmount(amounts[0]);
        const dolaresAmt = parseLatamAmount(amounts[1]);
        if (!isNaN(pesosAmt) && pesosAmt !== 0) {
          transactions.push({ date, description, amount: -Math.abs(pesosAmt), currency: 'ARS' });
        }
        if (!isNaN(dolaresAmt) && dolaresAmt !== 0) {
          transactions.push({ date, description, amount: -Math.abs(dolaresAmt), currency: 'USD' });
        }
      } else {
        const amt = parseLatamAmount(amounts[0]);
        if (isNaN(amt) || amt === 0) continue;
        transactions.push({ date, description, amount: -Math.abs(amt), currency: 'ARS' });
      }
    }

    return transactions;
  },
};
