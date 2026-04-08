export type SourceType = 'card' | 'account' | 'file';

export interface BankSource {
  id: string;
  bank: string;
  type: SourceType;
  product: string;
  currencies: string[];
  parserKey: string;
}

export const BANK_SOURCES: BankSource[] = [
  // Galicia
  { id: 'galicia_visa', bank: 'Galicia', type: 'card', product: 'Visa', currencies: ['ARS'], parserKey: 'galicia_card' },
  { id: 'galicia_mc', bank: 'Galicia', type: 'card', product: 'Mastercard', currencies: ['ARS'], parserKey: 'galicia_card' },
  { id: 'galicia_savings_usd', bank: 'Galicia', type: 'account', product: 'Caja Ahorro USD', currencies: ['USD'], parserKey: 'galicia_bank' },
  { id: 'galicia_salary_ars', bank: 'Galicia', type: 'account', product: 'Cuenta Sueldo ARS', currencies: ['ARS'], parserKey: 'galicia_bank' },

  // Santander
  { id: 'santander_visa', bank: 'Santander', type: 'card', product: 'Visa', currencies: ['ARS'], parserKey: 'santander_card' },
  { id: 'santander_amex', bank: 'Santander', type: 'card', product: 'Amex', currencies: ['ARS'], parserKey: 'santander_card' },
  { id: 'santander_account', bank: 'Santander', type: 'account', product: 'Cuenta Corriente', currencies: ['ARS'], parserKey: 'santander_bank' },

  // Itaú
  { id: 'itau_visa', bank: 'Itaú', type: 'card', product: 'Visa', currencies: ['UYU', 'USD'], parserKey: 'itau_visa' },
  { id: 'itau_account_uyu', bank: 'Itaú', type: 'account', product: 'Cuenta UYU', currencies: ['UYU'], parserKey: 'itau_bank' },
  { id: 'itau_account_usd', bank: 'Itaú', type: 'account', product: 'Cuenta USD', currencies: ['USD'], parserKey: 'itau_bank' },

  // Generic
  { id: 'generic_csv', bank: 'Generic', type: 'file', product: 'CSV', currencies: ['ARS', 'USD', 'UYU'], parserKey: 'generic_csv' },
  { id: 'generic_xlsx', bank: 'Generic', type: 'file', product: 'Excel', currencies: ['ARS', 'USD', 'UYU'], parserKey: 'generic_xlsx' },
];

export function getBankSource(id: string): BankSource | undefined {
  return BANK_SOURCES.find((s) => s.id === id);
}

export function getBankSourcesByParser(parserKey: string): BankSource[] {
  return BANK_SOURCES.filter((s) => s.parserKey === parserKey);
}
