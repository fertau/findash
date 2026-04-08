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
 * These are the file format parsers available in the system.
 * Users configure their own sources via Settings → Sources,
 * selecting which parser to use for each bank/card/account.
 *
 * Bank-specific parsers handle known PDF/XLS layouts.
 * Generic parsers handle CSV/XLSX with configurable column mappings.
 */
export const AVAILABLE_PARSERS = [
  // Generic parsers — work with any institution
  { key: 'generic_csv', label: 'CSV genérico', description: 'Archivo CSV con columnas configurables' },
  { key: 'generic_xlsx', label: 'Excel genérico', description: 'Archivo XLS/XLSX con columnas configurables' },
  // Bank-specific parsers — handle known PDF/XLS formats
  { key: 'galicia_card', label: 'PDF tarjeta de crédito (formato Galicia)', description: 'Resumen PDF con formato fecha-descripción-monto' },
  { key: 'galicia_bank', label: 'PDF cuenta bancaria (formato Galicia)', description: 'Extracto PDF de cuenta' },
  { key: 'santander_card', label: 'PDF tarjeta de crédito (formato Santander)', description: 'Resumen PDF Visa/Amex' },
  { key: 'santander_bank', label: 'PDF cuenta bancaria (formato Santander)', description: 'Extracto PDF de cuenta corriente' },
  { key: 'itau_visa', label: 'PDF tarjeta Visa (formato Itaú, doble columna)', description: 'PDF con columnas separadas por moneda' },
  { key: 'itau_bank', label: 'XLS cuenta bancaria (formato Itaú)', description: 'Planilla XLS de movimientos' },
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
