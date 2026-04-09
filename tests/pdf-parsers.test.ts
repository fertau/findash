import { describe, it, expect } from 'vitest';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import { parsePDFText, parsePDFTextAutoDetect } from '@/lib/parsing/pdf-parsers';

const PUBLIC = 'public/';

async function getText(file: string): Promise<string> {
  const buf = fs.readFileSync(PUBLIC + file);
  const data = await pdfParse(buf);
  return data.text;
}

describe('galicia_bank', () => {
  it('parses Galicia bank account PDF', async () => {
    const text = await getText('RESUMEN_EXTRACTOS CONSOLIDADOS - CAJA DE AHORRO 30-01-2026.pdf');
    const txs = parsePDFText(text, 'galicia_bank');
    console.log(`galicia_bank: ${txs.length} transactions`);
    console.log('first:', txs[0]);
    console.log('last:', txs[txs.length - 1]);
    expect(txs.length).toBeGreaterThan(10);
    expect(txs[0].currency).toBe('ARS');
  });
});

describe('galicia_card (Visa)', () => {
  it('parses Galicia Visa PDF', async () => {
    const text = await getText('RESUMEN_VISA22_1_2026pdf.pdf');
    const txs = parsePDFText(text, 'galicia_card');
    console.log(`galicia_card (Visa): ${txs.length} transactions`);
    if (txs.length > 0) { console.log('first:', txs[0]); console.log('last:', txs[txs.length - 1]); }
    expect(txs.length).toBeGreaterThan(5);
  });
});

describe('galicia_card (Mastercard)', () => {
  it('parses Galicia Mastercard PDF', async () => {
    const text = await getText('RESUMEN_MAST31_1_2026pdf.pdf');
    const txs = parsePDFText(text, 'galicia_card');
    console.log(`galicia_card (MC): ${txs.length} transactions`);
    if (txs.length > 0) { console.log('first:', txs[0]); console.log('last:', txs[txs.length - 1]); }
    expect(txs.length).toBeGreaterThan(5);
  });
});

describe('santander_card (Visa)', () => {
  it('parses Santander Visa PDF', async () => {
    const text = await getText('Resumen de tarjeta de crédito VISA-09-01-2026.pdf');
    const txs = parsePDFText(text, 'santander_card');
    console.log(`santander_card (Visa): ${txs.length} transactions`);
    if (txs.length > 0) { console.log('first:', txs[0]); console.log('last:', txs[txs.length - 1]); }
    expect(txs.length).toBeGreaterThan(5);
  });
});

describe('santander_card (Amex)', () => {
  it('parses Santander Amex PDF', async () => {
    const text = await getText('Resumen de tarjeta de crédito AMEX-12-01-2026.pdf');
    const txs = parsePDFText(text, 'santander_card');
    console.log(`santander_card (Amex): ${txs.length} transactions`);
    if (txs.length > 0) { console.log('first:', txs[0]); console.log('last:', txs[txs.length - 1]); }
    // This AMEX sample has very few transactions (3-5 consumption lines + credits/taxes)
    expect(txs.length).toBeGreaterThanOrEqual(3);
  });
});

describe('santander_bank', () => {
  it('parses Santander bank PDF', async () => {
    const text = await getText('2026-02-26_00720033007000215956.pdf');
    const txs = parsePDFText(text, 'santander_bank');
    console.log(`santander_bank: ${txs.length} transactions`);
    if (txs.length > 0) { console.log('first:', txs[0]); console.log('last:', txs[txs.length - 1]); }
    expect(txs.length).toBeGreaterThan(3);
  });
});

describe('itau_visa', () => {
  it('parses Itaú Visa PDF', async () => {
    const text = await getText('V_202601.pdf');
    const txs = parsePDFText(text, 'itau_visa');
    console.log(`itau_visa: ${txs.length} transactions`);
    if (txs.length > 0) { console.log('first:', txs[0]); console.log('last:', txs[txs.length - 1]); }
    expect(txs.length).toBeGreaterThan(5);
  });
});

describe('auto-detect', () => {
  const testFiles = [
    'RESUMEN_EXTRACTOS CONSOLIDADOS - CAJA DE AHORRO 30-01-2026.pdf',
    'RESUMEN_VISA22_1_2026pdf.pdf',
    'RESUMEN_MAST31_1_2026pdf.pdf',
    'V_202601.pdf',
  ];

  for (const file of testFiles) {
    it(`auto-detects ${file.substring(0, 40)}`, async () => {
      const text = await getText(file);
      const txs = parsePDFTextAutoDetect(text);
      console.log(`auto-detect ${file.substring(0, 30)}: ${txs.length} txs`);
      expect(txs.length).toBeGreaterThan(0);
    });
  }
});
