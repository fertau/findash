import type { ParserPlugin } from '../parser-registry';
import {
  parseLatamAmount, AMOUNT_CREDIT_RE, resolveMonth,
  stripInstallments, cleanDescription,
} from '../toolkit';

const SKIP_RE = /SU PAGO|SALDO ANTERIOR|SALDO PENDIENTE|CR\.RG|PERCEP\.\s*(?:RG|IIBB)|IMP\.\s*(?:PA[IÍ]S|GANANC)|BIENES PERSONALES|SEG\.\s*(?:VIDA|ACCID)|COMISION\b|CARGO POR|INTERES\b|SUBTOTAL|^TOTAL\b/i;

const DATED_LINE_RE = /^(\d{2})\s+(Enero|Febrer\.?|Marzo|Abril|Mayo|Junio|Julio|Agosto|Setiem\.?|Octubr\.?|Noviem\.?|Diciem\.?)\s+(\d{1,2})\s+(.+)$/i;
const CONT_LINE_RE = /^\s{6,}(\d{1,2})\s+(.+)$/;

export const santanderCard: ParserPlugin = {
  key: 'santander_card',
  label: 'Santander – Tarjeta (Visa/Amex)',
  institution: 'Santander',
  documentType: 'Tarjeta de Crédito',
  fingerprints: [
    /Santander/i,
    /RESUMEN DE CUENTA/i,
    /(?:VISA|AMERICAN\s+EXPRESS)/i,
  ],
  parse(text) {
    const transactions: ReturnType<ParserPlugin['parse']> = [];
    const lines = text.split('\n');

    let currentYear = '';
    let currentMonth = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || SKIP_RE.test(trimmed)) continue;
      if (/Total Consumos|^_+$|cuotas de \$|TNA Fija|TEA:/i.test(trimmed)) continue;

      let day: string | null = null;
      let restOfLine = '';

      const dateMatch = trimmed.match(DATED_LINE_RE);
      if (dateMatch) {
        currentYear = dateMatch[1];
        const monthStr = dateMatch[2].replace('.', '').toLowerCase();
        currentMonth = resolveMonth(monthStr) || '';
        day = dateMatch[3].padStart(2, '0');
        restOfLine = dateMatch[4];
      } else {
        const contMatch = line.match(CONT_LINE_RE);
        if (contMatch && currentYear && currentMonth) {
          day = contMatch[1].padStart(2, '0');
          restOfLine = contMatch[2];
        }
      }

      if (!day || !currentMonth || !currentYear) continue;

      const date = `${day}/${currentMonth}/${currentYear}`;

      // Strip comprobante number and marker (* or K)
      restOfLine = restOfLine.replace(/^\d{3,}\s+[*K]?\s*/, '').trim();
      restOfLine = restOfLine.replace(/^\d{6}\s+/, '').trim();
      if (!restOfLine) continue;

      // Extract amounts
      const amountPattern = new RegExp(AMOUNT_CREDIT_RE.source, 'g');
      const allAmounts: string[] = [];
      let amountMatch: RegExpExecArray | null;
      while ((amountMatch = amountPattern.exec(restOfLine)) !== null) {
        allAmounts.push(amountMatch[1]);
      }
      if (allAmounts.length === 0) continue;

      // Description is before first amount
      const firstAmtIdx = restOfLine.indexOf(allAmounts[0]);
      let description = restOfLine.slice(0, firstAmtIdx).trim();
      description = stripInstallments(description);
      if (!description) description = 'Sin descripcion';

      for (let ai = 0; ai < allAmounts.length; ai++) {
        let amtStr = allAmounts[ai];
        let isCredit = false;
        if (amtStr.endsWith('-')) {
          isCredit = true;
          amtStr = amtStr.slice(0, -1);
        }
        const amt = parseLatamAmount(amtStr);
        if (isNaN(amt) || amt === 0) continue;

        const currency = ai === 0 ? 'ARS' as const : 'USD' as const;
        const finalAmt = isCredit ? Math.abs(amt) : -Math.abs(amt);

        transactions.push({ date, description, amount: finalAmt, currency });
      }
    }

    return transactions;
  },
};
