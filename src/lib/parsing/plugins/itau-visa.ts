import type { ParserPlugin } from '../parser-registry';
import {
  parseLatamAmount, AMOUNT_RE,
  DATE_PATTERNS, stripInstallments, cleanDescription,
} from '../toolkit';

const SKIP_RE = /SALDO DEL ESTADO DE CUENTA ANTERIOR|SEGURO DE VIDA|SALDO CONTADO|Reducci[oó]n de IVA|^PAGOS\b/i;

export const itauVisa: ParserPlugin = {
  key: 'itau_visa',
  label: 'Itaú – Tarjeta Visa (UY)',
  institution: 'Itaú',
  documentType: 'Tarjeta Visa',
  fingerprints: [
    /Ita[úu]/i,
    /ESTADO DE CUENTA/i,
    /UYU|U\$S/i,
  ],
  parse(text) {
    const transactions: ReturnType<ParserPlugin['parse']> = [];
    const lines = text.split('\n');
    const DATE_RE = DATE_PATTERNS.spaceDMY;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || SKIP_RE.test(trimmed)) continue;

      const dateMatch = trimmed.match(DATE_RE);
      if (!dateMatch) continue;

      const date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
      const afterDate = trimmed.slice((dateMatch.index ?? 0) + dateMatch[0].length).trim();

      // Skip optional 4-digit code
      let rest = afterDate.replace(/^\d{4}\s+/, '');

      const amountPattern = /(-?[\d.]+,\d{2})/g;
      const allAmounts: string[] = [];
      let amtMatch: RegExpExecArray | null;
      while ((amtMatch = amountPattern.exec(rest)) !== null) {
        allAmounts.push(amtMatch[1]);
      }
      if (allAmounts.length === 0) continue;

      const firstAmtIdx = rest.indexOf(allAmounts[0]);
      let description = rest.slice(0, firstAmtIdx).trim();
      description = description.replace(/\s*\d{1,2}\s*\/\s*\d{1,2}\s*$/, '').trim();
      description = stripInstallments(description);
      if (!description) description = 'Sin descripcion';

      if (allAmounts.length >= 2) {
        const uyuAmt = parseLatamAmount(allAmounts[0]);
        const usdAmt = parseLatamAmount(allAmounts[1]);
        if (!isNaN(uyuAmt) && uyuAmt !== 0) {
          transactions.push({ date, description, amount: uyuAmt < 0 ? uyuAmt : -Math.abs(uyuAmt), currency: 'UYU' });
        }
        if (!isNaN(usdAmt) && usdAmt !== 0) {
          transactions.push({ date, description, amount: usdAmt < 0 ? usdAmt : -Math.abs(usdAmt), currency: 'USD' });
        }
      } else {
        const amtStr = allAmounts[0];
        const posInOriginal = line.indexOf(amtStr);
        const isUSD = posInOriginal > 70;
        const amt = parseLatamAmount(amtStr);
        if (isNaN(amt) || amt === 0) continue;
        transactions.push({
          date, description,
          amount: amt < 0 ? amt : -Math.abs(amt),
          currency: isUSD ? 'USD' : 'UYU',
        });
      }
    }

    return transactions;
  },
};
