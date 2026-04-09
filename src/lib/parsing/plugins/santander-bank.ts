import type { ParserPlugin } from '../parser-registry';
import {
  parseLatamAmount, CURRENCY_AMOUNT_RE,
  DATE_PATTERNS, shouldSkipLine, stripInstallments,
} from '../toolkit';

const SKIP_PATTERNS = [/Saldo Inicial/i, /Saldo total/i];

export const santanderBank: ParserPlugin = {
  key: 'santander_bank',
  label: 'Santander – Cuenta Bancaria',
  institution: 'Santander',
  documentType: 'Cuenta Bancaria',
  fingerprints: [
    /Santander/i,
    /Movimientos en pesos/i,
    /Saldo Inicial/i,
  ],
  parse(text) {
    const transactions: ReturnType<ParserPlugin['parse']> = [];
    const lines = text.split('\n');
    const DATE_RE = DATE_PATTERNS.slashDMY;

    let sectionCurrency: 'ARS' | 'USD' = 'ARS';
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();
      i++;

      if (/Movimientos en d[oó]lares/i.test(line)) { sectionCurrency = 'USD'; continue; }
      if (/Movimientos en pesos/i.test(line)) { sectionCurrency = 'ARS'; continue; }
      if (!line || shouldSkipLine(line, SKIP_PATTERNS)) continue;

      const dateMatch = line.match(DATE_RE);
      if (!dateMatch) continue;

      const date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
      const txLines: string[] = [line.slice(dateMatch[0].length)];

      while (i < lines.length) {
        const nextLine = lines[i].trim();
        if (!nextLine || DATE_RE.test(nextLine) || /Movimientos en/i.test(nextLine) || shouldSkipLine(nextLine, SKIP_PATTERNS)) break;
        txLines.push(nextLine);
        i++;
      }

      const fullText = txLines.join(' ');

      const allAmounts: { currency: 'ARS' | 'USD'; amount: number }[] = [];
      const re = new RegExp(CURRENCY_AMOUNT_RE.source, 'g');
      let curMatch: RegExpExecArray | null;
      while ((curMatch = re.exec(fullText)) !== null) {
        const raw = curMatch[1];
        const isUSD = raw.includes('U$S');
        const cur: 'ARS' | 'USD' = isUSD ? 'USD' : sectionCurrency;
        const cleaned = raw.replace(/U\$S/g, '').replace(/\$/g, '').trim();
        const amt = parseLatamAmount(cleaned);
        if (!isNaN(amt)) allAmounts.push({ currency: cur, amount: amt });
      }

      if (allAmounts.length < 2) continue; // need amount + balance

      const txAmounts = allAmounts.slice(0, -1); // last is balance

      const firstDollarIdx = fullText.search(/[-]?\s*(?:U?\$)/);
      let description = firstDollarIdx >= 0
        ? fullText.slice(0, firstDollarIdx).trim()
        : fullText.trim();

      description = description.replace(/^\d{5,}\s*/, '').trim();
      description = description.replace(/\s+/g, ' ').trim();
      if (!description) description = 'Sin descripcion';

      for (const txAmt of txAmounts) {
        if (txAmt.amount === 0) continue;
        transactions.push({
          date,
          description: stripInstallments(description),
          amount: txAmt.amount,
          currency: txAmt.currency,
        });
      }
    }

    return transactions;
  },
};
