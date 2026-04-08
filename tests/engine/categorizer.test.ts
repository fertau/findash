import { describe, it, expect } from 'vitest';
import { categorize, categorizeBatch } from '@/lib/engine/categorizer';
import type { CategorizationRule } from '@/lib/db/types';

const rules: CategorizationRule[] = [
  // Exact match (priority 1)
  { id: 'r1', pattern: 'YPF AUTOPISTA', matchType: 'exact', categoryId: 'cat_combustible', priority: 1, createdBy: 'test', createdAt: '' },
  // Contains match (priority 10)
  { id: 'r2', pattern: 'MERCADOLIBRE', matchType: 'contains', categoryId: 'cat_supermercado', priority: 10, createdBy: 'test', createdAt: '' },
  // Regex match (priority 20)
  { id: 'r3', pattern: 'YPF|SHELL|AXION', matchType: 'regex', categoryId: 'cat_combustible', priority: 20, createdBy: 'test', createdAt: '' },
  // Contains for restaurant
  { id: 'r4', pattern: 'RESTAURANT', matchType: 'contains', categoryId: 'cat_restaurant', priority: 30, createdBy: 'test', createdAt: '' },
  // Regex for streaming
  { id: 'r5', pattern: 'NETFLIX|SPOTIFY|DISNEY', matchType: 'regex', categoryId: 'cat_streaming', priority: 40, createdBy: 'test', createdAt: '' },
];

describe('categorize', () => {
  it('matches exact rule', () => {
    const result = categorize('YPF AUTOPISTA', rules);
    expect(result.categoryId).toBe('cat_combustible');
    expect(result.matchType).toBe('exact');
  });

  it('matches contains rule', () => {
    const result = categorize('MERCADOLIBRE COMPRA #12345', rules);
    expect(result.categoryId).toBe('cat_supermercado');
    expect(result.matchType).toBe('contains');
  });

  it('matches regex rule', () => {
    const result = categorize('SHELL ESTACION 42', rules);
    expect(result.categoryId).toBe('cat_combustible');
    expect(result.matchType).toBe('regex');
  });

  it('returns uncategorized for unknown description', () => {
    const result = categorize('RANDOM TRANSACTION XYZ', rules);
    expect(result.categoryId).toBe('cat_sin_categorizar');
    expect(result.matchType).toBe('uncategorized');
  });

  it('respects priority ordering — exact wins over regex', () => {
    // "YPF AUTOPISTA" matches both exact (r1) and regex (r3)
    const result = categorize('YPF AUTOPISTA', rules);
    expect(result.matchType).toBe('exact');
    expect(result.categoryId).toBe('cat_combustible');
  });

  it('handles case insensitivity for regex', () => {
    const result = categorize('NETFLIX MENSUAL', rules);
    expect(result.categoryId).toBe('cat_streaming');
  });

  it('handles empty description', () => {
    const result = categorize('', rules);
    expect(result.categoryId).toBe('cat_sin_categorizar');
  });

  it('handles empty rules', () => {
    const result = categorize('ANYTHING', []);
    expect(result.categoryId).toBe('cat_sin_categorizar');
  });
});

describe('categorizeBatch', () => {
  it('categorizes multiple descriptions efficiently', () => {
    const descriptions = [
      'YPF AUTOPISTA',
      'MERCADOLIBRE COMPRA',
      'UNKNOWN TX',
      'SPOTIFY PREMIUM',
      'RESTAURANT LA CABANA',
    ];

    const results = categorizeBatch(descriptions, rules);

    expect(results).toHaveLength(5);
    expect(results[0].categoryId).toBe('cat_combustible');
    expect(results[1].categoryId).toBe('cat_supermercado');
    expect(results[2].categoryId).toBe('cat_sin_categorizar');
    expect(results[3].categoryId).toBe('cat_streaming');
    expect(results[4].categoryId).toBe('cat_restaurant');
  });

  it('handles empty input', () => {
    const results = categorizeBatch([], rules);
    expect(results).toHaveLength(0);
  });
});
