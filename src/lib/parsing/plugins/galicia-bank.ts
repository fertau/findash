import type { ParserPlugin } from '../parser-registry';
import {
  parseLatamAmount, extractAmounts, AMOUNT_RE,
  DATE_PATTERNS, extractSection, shouldSkipLine,
  stripInstallments,
} from '../toolkit';

const PAGE_HEADER_RE = /Resumen de Cuenta|Página|^\d{15,}P$/;
const SKIP_PATTERNS = [PAGE_HEADER_RE, /^Total\b/, /^Saldo\b/];

export const galiciaBank: ParserPlugin = {
  key: 'galicia_bank',
  label: 'Galicia – Cuenta Bancaria',
  institution: 'Galicia',
  documentType: 'Cuenta Bancaria',
  fingerprints: [
    /Banco de Galicia/i,
    /EXTRACTOS CONSOLIDADOS/i,
    /CAJA DE AHORRO/i,
  ],
  parse(text) {
    const transactions: ReturnType<ParserPlugin['parse']> = [];

    const movStart = text.indexOf('Movimientos');
    if (movStart === -1) return transactions;
    const headerIdx = text.indexOf('Saldo', movStart);
    if (headerIdx === -1) return transactions;

    const lines = text.slice(headerIdx).split('\n');
    const DATE_RE = DATE_PATTERNS.slashDMY;
    let i = 1; // skip header

    while (i < lines.length) {
      const line = lines[i].trim();
      i++;

      if (!line || shouldSkipLine(line, SKIP_PATTERNS)) continue;

      const dateMatch = line.match(DATE_RE);
      if (!dateMatch) continue;

      const date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
      const rest = line.slice(dateMatch[0].length);

      const descParts: string[] = [];
      let amounts = extractAmounts(rest, AMOUNT_RE);
      let amountLine = rest;

      if (amounts.length === 0) {
        descParts.push(rest.trim());
        while (i < lines.length) {
          const nextLine = lines[i].trim();
          if (!nextLine || DATE_RE.test(nextLine) || shouldSkipLine(nextLine, SKIP_PATTERNS)) break;
          const nextAmounts = extractAmounts(nextLine, AMOUNT_RE);
          if (nextAmounts.length >= 2) {
            amountLine = nextLine;
            amounts = nextAmounts;
            i++;
            break;
          }
          descParts.push(nextLine);
          i++;
        }
      } else {
        const firstAmountIdx = rest.indexOf(amounts[0]);
        if (firstAmountIdx > 0) descParts.push(rest.slice(0, firstAmountIdx).trim());
      }

      if (amounts.length === 0) {
        while (i < lines.length) {
          const nextLine = lines[i].trim();
          if (!nextLine || DATE_RE.test(nextLine) || PAGE_HEADER_RE.test(nextLine)) break;
          const nextAmounts = extractAmounts(nextLine, AMOUNT_RE);
          if (nextAmounts.length >= 1) {
            amounts = nextAmounts;
            amountLine = nextLine;
            i++;
            break;
          }
          descParts.push(nextLine);
          i++;
        }
      }

      if (amounts.length < 2) continue; // need amount + balance

      const txAmountStr = amounts[amounts.length - 2];
      const amount = parseLatamAmount(txAmountStr);
      if (isNaN(amount) || amount === 0) continue;

      let description: string;
      if (descParts.length > 0) {
        description = descParts.join(' ').trim();
      } else {
        const idx = amountLine.indexOf(txAmountStr);
        description = amountLine.slice(0, idx).trim();
      }

      description = description.replace(/\s+/g, ' ').trim();
      if (!description) description = 'Sin descripcion';

      transactions.push({
        date,
        description: stripInstallments(description),
        amount,
        currency: 'ARS',
      });
    }

    return transactions;
  },
};
