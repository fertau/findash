export type SourceType = 'card' | 'account' | 'file';

export interface BankSource {
  id: string;
  bank: string;
  type: SourceType;
  product: string;
  currencies: string[];
  parserKey: string;
}

/**
 * Built-in parser registry.
 * These are the parsers available in the system — not the user's banks.
 * Users configure their own sources via Settings → Cards/Sources,
 * selecting which parser to use for each one.
 */
export const AVAILABLE_PARSERS = [
  { key: 'generic_csv', label: 'CSV genérico', description: 'Archivo CSV con columnas configurables' },
  { key: 'generic_xlsx', label: 'Excel genérico', description: 'Archivo XLS/XLSX con columnas configurables' },
  { key: 'galicia_card', label: 'Tarjeta de crédito (Galicia)', description: 'PDF de resumen de tarjeta Galicia' },
  { key: 'galicia_bank', label: 'Cuenta bancaria (Galicia)', description: 'PDF de cuenta Galicia' },
  { key: 'santander_card', label: 'Tarjeta de crédito (Santander)', description: 'PDF de resumen Santander' },
  { key: 'santander_bank', label: 'Cuenta bancaria (Santander)', description: 'PDF de cuenta Santander' },
  { key: 'itau_visa', label: 'Tarjeta Visa (Itaú)', description: 'PDF de Visa Itaú (doble columna UYU/USD)' },
  { key: 'itau_bank', label: 'Cuenta bancaria (Itaú)', description: 'XLS de cuenta Itaú' },
] as const;

/**
 * Default generic sources — always available without configuration.
 * Bank-specific sources are configured by the user via the API/Settings.
 */
export const DEFAULT_SOURCES: BankSource[] = [
  { id: 'generic_csv', bank: 'Genérico', type: 'file', product: 'CSV', currencies: ['ARS', 'USD', 'UYU'], parserKey: 'generic_csv' },
  { id: 'generic_xlsx', bank: 'Genérico', type: 'file', product: 'Excel', currencies: ['ARS', 'USD', 'UYU'], parserKey: 'generic_xlsx' },
];

/**
 * Get a source by ID — checks household-configured sources first,
 * then falls back to default generic sources.
 */
export function getBankSource(id: string, householdSources?: BankSource[]): BankSource | undefined {
  if (householdSources) {
    const found = householdSources.find((s) => s.id === id);
    if (found) return found;
  }
  return DEFAULT_SOURCES.find((s) => s.id === id);
}

export function getBankSourcesByParser(parserKey: string, householdSources?: BankSource[]): BankSource[] {
  const all = [...DEFAULT_SOURCES, ...(householdSources || [])];
  return all.filter((s) => s.parserKey === parserKey);
}
