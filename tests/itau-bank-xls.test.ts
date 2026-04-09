import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { parseItauBankXLS } from '@/lib/parsing/plugins/itau-bank';

describe('itau_bank XLS', () => {
  it('parses Itaú bank account XLS', async () => {
    const buf = fs.readFileSync('public/Estado_De_Cuenta_1760112 (6)_Enero 2026.xls');
    const txs = await parseItauBankXLS(buf);
    console.log(`itau_bank XLS: ${txs.length} transactions`);
    if (txs.length > 0) {
      console.log('first:', txs[0]);
      console.log('last:', txs[txs.length - 1]);
    }
    expect(txs.length).toBeGreaterThan(0);
    expect(txs[0].currency).toBe('USD');
    // Debits should be negative, credits positive
    const hasNegative = txs.some((t) => t.amount < 0);
    const hasPositive = txs.some((t) => t.amount > 0);
    expect(hasNegative).toBe(true);
    expect(hasPositive).toBe(true);
  });
});
