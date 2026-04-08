import { describe, it, expect } from 'vitest';
import { checkExclusion } from '@/lib/engine/exclusions';
import type { ExclusionRule, HouseholdMember, CardMapping } from '@/lib/db/types';

const exclusionRules: ExclusionRule[] = [
  {
    id: 'er1',
    pattern: 'BALANZ|DOLAR MEP',
    matchType: 'regex',
    reason: 'MEP/arbitrage operation',
    isActive: true,
    createdBy: 'test',
    createdAt: '',
  },
  {
    id: 'er2',
    pattern: 'FIMA|FONDO COMUN|FCI',
    matchType: 'regex',
    reason: 'Investment fund flow',
    isActive: true,
    createdBy: 'test',
    createdAt: '',
  },
  {
    id: 'er3',
    pattern: 'SPECIFIC VENDOR',
    matchType: 'contains',
    reason: 'Test exclusion',
    isActive: true,
    createdBy: 'test',
    createdAt: '',
  },
];

const members: HouseholdMember[] = [
  { userId: 'u1', email: 'owner@test.com', displayName: 'Owner', role: 'owner', isExcluded: false, canUpload: true, canViewAll: true, joinedAt: '' },
  { userId: 'u2', email: 'member@test.com', displayName: 'Member', role: 'member', isExcluded: false, canUpload: true, canViewAll: false, joinedAt: '' },
  { userId: 'u3', email: 'excluded@test.com', displayName: 'Excluded Person', role: 'member', isExcluded: true, exclusionReason: 'Not part of household analysis', canUpload: false, canViewAll: false, joinedAt: '' },
];

const cardMappings: CardMapping[] = [
  { id: 'c1', sourceId: 'galicia_visa', memberId: 'u1', isAdditional: false, isExcluded: false },
  { id: 'c2', sourceId: 'santander_visa', lastFour: '7429', memberId: 'u3', isAdditional: false, isExcluded: true, notes: 'Excluded card' },
  { id: 'c3', sourceId: 'itau_visa', memberId: 'u1', isAdditional: false, isExcluded: true, excludeBeforeDate: '2026-01-29' },
];

describe('checkExclusion', () => {
  it('excludes transactions from excluded members', () => {
    const result = checkExclusion(
      { description: 'SUPERMERCADO', normalizedDescription: 'SUPERMERCADO', memberId: 'u3', sourceId: 'galicia_visa', date: '2026-03-15' },
      exclusionRules,
      members,
      cardMappings
    );
    expect(result.excluded).toBe(true);
    expect(result.reason).toBe('Not part of household analysis');
  });

  it('excludes Balanz MEP operations', () => {
    const result = checkExclusion(
      { description: 'BALANZ TRANSFER', normalizedDescription: 'BALANZ TRANSFER', memberId: 'u1', sourceId: 'galicia_visa', date: '2026-03-15' },
      exclusionRules,
      members,
      cardMappings
    );
    expect(result.excluded).toBe(true);
    expect(result.reason).toBe('MEP/arbitrage operation');
  });

  it('excludes FIMA investment flows', () => {
    const result = checkExclusion(
      { description: 'SUSCRIPCION FIMA ARS', normalizedDescription: 'SUSCRIPCION FIMA ARS', memberId: 'u1', sourceId: 'galicia_visa', date: '2026-03-15' },
      exclusionRules,
      members,
      cardMappings
    );
    expect(result.excluded).toBe(true);
    expect(result.reason).toBe('Investment fund flow');
  });

  it('does not exclude regular transactions', () => {
    const result = checkExclusion(
      { description: 'SUPERMERCADO CARREFOUR', normalizedDescription: 'SUPERMERCADO CARREFOUR', memberId: 'u1', sourceId: 'galicia_visa', date: '2026-03-15' },
      exclusionRules,
      members,
      cardMappings
    );
    expect(result.excluded).toBe(false);
  });

  it('excludes by card mapping', () => {
    const result = checkExclusion(
      { description: 'COMPRA SHOP', normalizedDescription: 'COMPRA SHOP', memberId: 'u3', sourceId: 'santander_visa', date: '2026-03-15', cardLastFour: '7429' },
      exclusionRules,
      members,
      cardMappings
    );
    expect(result.excluded).toBe(true);
  });

  it('handles date-based card exclusion (before cutoff → excluded)', () => {
    const result = checkExclusion(
      { description: 'COMPRA', normalizedDescription: 'COMPRA', memberId: 'u1', sourceId: 'itau_visa', date: '2026-01-15' },
      exclusionRules,
      members,
      cardMappings
    );
    expect(result.excluded).toBe(true);
  });

  it('handles date-based card exclusion (after cutoff → not excluded)', () => {
    const result = checkExclusion(
      { description: 'COMPRA', normalizedDescription: 'COMPRA', memberId: 'u1', sourceId: 'itau_visa', date: '2026-02-15' },
      exclusionRules,
      members,
      cardMappings
    );
    expect(result.excluded).toBe(false);
  });

  it('excludes by contains pattern', () => {
    const result = checkExclusion(
      { description: 'SPECIFIC VENDOR COMPRA', normalizedDescription: 'SPECIFIC VENDOR COMPRA', memberId: 'u1', sourceId: 'galicia_visa', date: '2026-03-15' },
      exclusionRules,
      members,
      cardMappings
    );
    expect(result.excluded).toBe(true);
    expect(result.reason).toBe('Test exclusion');
  });

  it('skips inactive rules', () => {
    const inactiveRules = exclusionRules.map((r) => ({ ...r, isActive: false }));
    const result = checkExclusion(
      { description: 'BALANZ TRANSFER', normalizedDescription: 'BALANZ TRANSFER', memberId: 'u1', sourceId: 'galicia_visa', date: '2026-03-15' },
      inactiveRules,
      members,
      cardMappings
    );
    expect(result.excluded).toBe(false);
  });
});
