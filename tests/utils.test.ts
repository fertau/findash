import { describe, it, expect } from 'vitest';
import {
  normalizeDescription,
  computeTransactionHash,
  parseDate,
  dateToPeriod,
  parseAmount,
} from '@/lib/utils';

describe('normalizeDescription', () => {
  it('trims and uppercases', () => {
    expect(normalizeDescription('  hello world  ')).toBe('HELLO WORLD');
  });

  it('removes accents', () => {
    expect(normalizeDescription('café résumé')).toBe('CAFE RESUME');
    expect(normalizeDescription('Alimentación')).toBe('ALIMENTACION');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeDescription('a  b   c')).toBe('A B C');
  });

  it('handles empty string', () => {
    expect(normalizeDescription('')).toBe('');
  });
});

describe('computeTransactionHash', () => {
  it('produces consistent hashes', () => {
    const h1 = computeTransactionHash('2026-03-15', 'SUPERMERCADO', 1500, 'ARS', 'galicia_visa');
    const h2 = computeTransactionHash('2026-03-15', 'SUPERMERCADO', 1500, 'ARS', 'galicia_visa');
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different inputs', () => {
    const h1 = computeTransactionHash('2026-03-15', 'SUPERMERCADO', 1500, 'ARS', 'galicia_visa');
    const h2 = computeTransactionHash('2026-03-16', 'SUPERMERCADO', 1500, 'ARS', 'galicia_visa');
    expect(h1).not.toBe(h2);
  });

  it('normalizes description for consistent hashing', () => {
    const h1 = computeTransactionHash('2026-03-15', '  café  ', 100, 'ARS', 's1');
    const h2 = computeTransactionHash('2026-03-15', 'CAFE', 100, 'ARS', 's1');
    expect(h1).toBe(h2);
  });

  it('returns hex string', () => {
    const hash = computeTransactionHash('2026-01-01', 'TEST', 100, 'ARS', 's1');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('parseDate', () => {
  it('parses ISO format', () => {
    expect(parseDate('2026-03-15')).toBe('2026-03-15');
  });

  it('parses DD/MM/YYYY', () => {
    expect(parseDate('15/03/2026')).toBe('2026-03-15');
  });

  it('parses DD-MM-YYYY', () => {
    expect(parseDate('15-03-2026')).toBe('2026-03-15');
  });

  it('parses DD-MM-YY (2-digit year)', () => {
    expect(parseDate('15-03-26')).toBe('2026-03-15');
  });

  it('parses DD/MM/YY', () => {
    expect(parseDate('15/03/26')).toBe('2026-03-15');
  });

  it('throws for unparseable dates', () => {
    expect(() => parseDate('not-a-date')).toThrow();
  });
});

describe('dateToPeriod', () => {
  it('extracts period from ISO date', () => {
    expect(dateToPeriod('2026-03-15')).toBe('2026-03');
  });

  it('extracts period from DD/MM/YYYY', () => {
    expect(dateToPeriod('15/03/2026')).toBe('2026-03');
  });

  it('throws for invalid format', () => {
    expect(() => dateToPeriod('invalid')).toThrow();
  });
});

describe('parseAmount', () => {
  it('parses standard decimal', () => {
    expect(parseAmount('1234.50')).toBe(1234.50);
  });

  it('parses LATAM format (dot thousands, comma decimal)', () => {
    expect(parseAmount('1.234,50')).toBe(1234.50);
  });

  it('parses US format (comma thousands, dot decimal)', () => {
    expect(parseAmount('1,234.50')).toBe(1234.50);
  });

  it('parses comma as decimal (no thousands)', () => {
    expect(parseAmount('5234,50')).toBe(5234.50);
  });

  it('strips currency symbols', () => {
    expect(parseAmount('$1.234,50')).toBe(1234.50);
  });

  it('handles negative amounts', () => {
    expect(parseAmount('-1234.50')).toBe(-1234.50);
  });
});
