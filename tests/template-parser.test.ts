import { describe, it, expect } from 'vitest';
import { testTemplate, templateToPlugin } from '@/lib/parsing/template-parser';
import type { ParserTemplate } from '@/lib/db/types';
import fs from 'fs';
import pdfParse from 'pdf-parse';

const PUBLIC = 'public/';

async function getText(file: string): Promise<string> {
  const buf = fs.readFileSync(PUBLIC + file);
  const data = await pdfParse(buf);
  return data.text;
}

/** Helper to build a minimal template for testing */
function makeTemplate(overrides: Partial<ParserTemplate>): ParserTemplate {
  return {
    id: 'test',
    householdId: 'test',
    label: 'Test',
    institution: 'Test',
    documentType: 'Test',
    fingerprints: [],
    dateFormat: 'DD/MM/YY',
    skipPatterns: [],
    hasTrailingMinus: false,
    hasBalanceColumn: false,
    defaultCurrency: 'ARS',
    negateAmounts: false,
    createdAt: '',
    updatedAt: '',
    createdBy: '',
    ...overrides,
  };
}

describe('template-parser: Galicia Bank via template', () => {
  it('parses Galicia bank account with a template config', async () => {
    const text = await getText('RESUMEN_EXTRACTOS CONSOLIDADOS - CAJA DE AHORRO 30-01-2026.pdf');

    const template = makeTemplate({
      label: 'Galicia – Cuenta',
      institution: 'Galicia',
      documentType: 'Cuenta Bancaria',
      fingerprints: ['Banco de Galicia', 'EXTRACTOS CONSOLIDADOS'],
      sectionStart: 'Saldo',
      dateFormat: 'DD/MM/YY',
      skipPatterns: ['/^Total\\b/', '/^Saldo\\b/', '/Resumen de Cuenta/', '/Página/'],
      hasBalanceColumn: true,
      defaultCurrency: 'ARS',
    });

    const result = testTemplate(template, text);
    console.log(`template galicia_bank: ${result.transactions.length} txs, section: ${result.sectionFound}`);
    if (result.transactions.length > 0) {
      console.log('  first:', result.transactions[0]);
      console.log('  last:', result.transactions[result.transactions.length - 1]);
    }
    expect(result.sectionFound).toBe(true);
    expect(result.transactions.length).toBeGreaterThan(5);
    expect(result.transactions[0].currency).toBe('ARS');
  });
});

describe('template-parser: Santander Bank via template (section currency)', () => {
  it('parses Santander bank with section-based currency', async () => {
    const text = await getText('2026-02-26_00720033007000215956.pdf');

    const template = makeTemplate({
      label: 'Santander – Cuenta',
      institution: 'Santander',
      documentType: 'Cuenta Bancaria',
      fingerprints: ['Santander', 'Movimientos en pesos'],
      dateFormat: 'DD/MM/YY',
      skipPatterns: ['/Saldo Inicial/i', '/Saldo total/i'],
      hasBalanceColumn: true,
      defaultCurrency: 'ARS',
      dualCurrency: {
        secondaryCurrency: 'USD',
        mode: 'section',
        sectionPatterns: [
          { pattern: '/Movimientos en d[oó]lares/i', currency: 'USD' },
          { pattern: '/Movimientos en pesos/i', currency: 'ARS' },
        ],
      },
    });

    const result = testTemplate(template, text);
    console.log(`template santander_bank: ${result.transactions.length} txs`);
    if (result.transactions.length > 0) {
      console.log('  first:', result.transactions[0]);
    }
    expect(result.transactions.length).toBeGreaterThan(0);
  });
});

describe('template-parser: Santander Card via template', () => {
  it('parses Santander Visa with YY-Month-DD format', async () => {
    const text = await getText('Resumen de tarjeta de crédito VISA-09-01-2026.pdf');

    const template = makeTemplate({
      label: 'Santander – Visa',
      institution: 'Santander',
      documentType: 'Tarjeta Visa',
      fingerprints: ['Santander', 'RESUMEN DE CUENTA', 'VISA'],
      dateFormat: 'YY-Month-DD',
      skipPatterns: [
        '/SU PAGO/i', '/SALDO ANTERIOR/i', '/SALDO PENDIENTE/i',
        '/Total Consumos/i', '/^_+$/', '/cuotas de \\$/i',
        '/TNA Fija/i', '/TEA:/i',
      ],
      pageHeaderPattern: '/RESUMEN DE CUENTA/',
      hasTrailingMinus: true,
      hasBalanceColumn: false,
      defaultCurrency: 'ARS',
      negateAmounts: true,
      continuationMinIndent: 6,
      descriptionCleanup: ['/^\\d{3,}\\s+[*K]?\\s*/', '/^\\d{6}\\s+/'],
    });

    const result = testTemplate(template, text);
    console.log(`template santander_card: ${result.transactions.length} txs`);
    if (result.transactions.length > 0) {
      console.log('  first:', result.transactions[0]);
      console.log('  last:', result.transactions[result.transactions.length - 1]);
    }
    expect(result.transactions.length).toBeGreaterThan(3);
  });
});

describe('template-parser: templateToPlugin', () => {
  it('creates a working plugin from a template', async () => {
    const text = await getText('RESUMEN_EXTRACTOS CONSOLIDADOS - CAJA DE AHORRO 30-01-2026.pdf');

    const template = makeTemplate({
      fingerprints: ['Banco de Galicia', 'EXTRACTOS CONSOLIDADOS'],
      sectionStart: 'Saldo',
      dateFormat: 'DD/MM/YY',
      skipPatterns: ['/^Total\\b/', '/^Saldo\\b/'],
      hasBalanceColumn: true,
    });

    const plugin = templateToPlugin(template);
    expect(plugin.key).toBe('template_test');
    expect(plugin.fingerprints.length).toBe(2);

    // Fingerprints should match
    expect(plugin.fingerprints[0].test(text)).toBe(true);

    // Plugin should parse
    const txs = plugin.parse(text);
    expect(txs.length).toBeGreaterThan(5);
  });
});

describe('template-parser: validation', () => {
  it('validates required fields', async () => {
    const { validateTemplate } = await import('@/lib/parsing/template-parser');

    const errors = validateTemplate({});
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.field === 'label')).toBe(true);
    expect(errors.some((e) => e.field === 'dateFormat')).toBe(true);
  });

  it('validates regex patterns', async () => {
    const { validateTemplate } = await import('@/lib/parsing/template-parser');

    const errors = validateTemplate({
      label: 'Test',
      institution: 'Test',
      documentType: 'Test',
      dateFormat: 'DD/MM/YY',
      defaultCurrency: 'ARS',
      fingerprints: ['/valid/i', '/(invalid[/'],  // second is bad regex
    });

    expect(errors.some((e) => e.field === 'fingerprints')).toBe(true);
  });
});
