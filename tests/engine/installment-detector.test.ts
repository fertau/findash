import { describe, it, expect } from 'vitest';
import { detectInstallment } from '@/lib/engine/installment-detector';

describe('detectInstallment', () => {
  it('detects "3/12" format', () => {
    const result = detectInstallment('SAURA 3/12');
    expect(result).not.toBeNull();
    expect(result!.current).toBe(3);
    expect(result!.total).toBe(12);
    expect(result!.cleanDescription).toBe('SAURA');
  });

  it('detects "C.01/03" format', () => {
    const result = detectInstallment('C.01/03 FARMACIA VIDA');
    expect(result).not.toBeNull();
    expect(result!.current).toBe(1);
    expect(result!.total).toBe(3);
    expect(result!.cleanDescription).toBe('FARMACIA VIDA');
  });

  it('detects "CUOTA 5 DE 8" format', () => {
    const result = detectInstallment('CUOTA 5 DE 8 TIENDA HOGAR');
    expect(result).not.toBeNull();
    expect(result!.current).toBe(5);
    expect(result!.total).toBe(8);
  });

  it('detects "CTA 3/6" format', () => {
    const result = detectInstallment('CTA 3/6 ELECTRONICA XYZ');
    expect(result).not.toBeNull();
    expect(result!.current).toBe(3);
    expect(result!.total).toBe(6);
  });

  it('returns null for non-installment descriptions', () => {
    expect(detectInstallment('SUPERMERCADO CARREFOUR')).toBeNull();
    expect(detectInstallment('NETFLIX')).toBeNull();
    expect(detectInstallment('YPF ESTACION 42')).toBeNull();
  });

  it('rejects invalid installment numbers', () => {
    // Current > Total
    expect(detectInstallment('SAURA 15/12')).toBeNull();
    // Total < 2 (not really an installment)
    expect(detectInstallment('SAURA 1/1')).toBeNull();
  });

  it('generates deterministic group IDs', () => {
    const r1 = detectInstallment('SAURA 3/12', 1000);
    const r2 = detectInstallment('SAURA 5/12', 1000);
    // Same merchant, same total, same amount → same group
    expect(r1!.groupId).toBe(r2!.groupId);
  });

  it('generates different group IDs for different merchants', () => {
    const r1 = detectInstallment('SAURA 3/12', 1000);
    const r2 = detectInstallment('FARMACIA 3/12', 1000);
    expect(r1!.groupId).not.toBe(r2!.groupId);
  });

  it('cleans installment notation from description', () => {
    expect(detectInstallment('SAURA 3/12')!.cleanDescription).toBe('SAURA');
    expect(detectInstallment('C.01/03 FARMACIA')!.cleanDescription).toBe('FARMACIA');
    expect(detectInstallment('CUOTA 5 DE 8 TIENDA')!.cleanDescription).toContain('TIENDA');
  });
});
