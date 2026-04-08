import { describe, it, expect } from 'vitest';
import { convertToBase, totalInBaseCurrency } from '@/lib/currency';
import type { ExchangeRate } from '@/lib/db/types';

const rates: ExchangeRate[] = [
  { id: 'r1', currency: 'USD', period: '2026-03', rate: 1200, source: 'manual', updatedAt: '' },
  { id: 'r2', currency: 'UYU', period: '2026-03', rate: 28, source: 'manual', updatedAt: '' },
];

describe('convertToBase', () => {
  it('returns original amount for base currency', () => {
    expect(convertToBase(1500, 'ARS', rates, 'ARS')).toBe(1500);
  });

  it('converts USD to ARS', () => {
    expect(convertToBase(100, 'USD', rates, 'ARS')).toBe(120000);
  });

  it('converts UYU to ARS', () => {
    expect(convertToBase(1000, 'UYU', rates, 'ARS')).toBe(28000);
  });

  it('throws when rate not found', () => {
    expect(() => convertToBase(100, 'USD', [], 'ARS')).toThrow('No exchange rate');
  });
});

describe('totalInBaseCurrency', () => {
  it('sums mixed currency transactions', () => {
    const txs = [
      { amount: 1500, currency: 'ARS' as const },
      { amount: 100, currency: 'USD' as const },  // = 120,000 ARS
      { amount: 500, currency: 'UYU' as const },   // = 14,000 ARS
    ];

    const total = totalInBaseCurrency(txs, rates, 'ARS');
    expect(total).toBe(1500 + 120000 + 14000);
  });

  it('handles empty list', () => {
    expect(totalInBaseCurrency([], rates, 'ARS')).toBe(0);
  });

  it('handles all same currency', () => {
    const txs = [
      { amount: 100, currency: 'ARS' as const },
      { amount: 200, currency: 'ARS' as const },
    ];
    expect(totalInBaseCurrency(txs, rates, 'ARS')).toBe(300);
  });
});
