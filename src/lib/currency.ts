import { getRate as getDbRate } from '@/lib/db/exchange-rates';
import type { Currency, ExchangeRate } from '@/lib/db/types';

/**
 * Convert an amount from one currency to a base currency using exchange rates.
 * If fromCurrency equals baseCurrency, returns the original amount.
 */
export function convertToBase(
  amount: number,
  fromCurrency: Currency,
  rates: ExchangeRate[],
  baseCurrency: Currency = 'ARS'
): number {
  if (fromCurrency === baseCurrency) return amount;

  const rate = rates.find((r) => r.currency === fromCurrency);
  if (!rate) {
    throw new Error(`No exchange rate found for ${fromCurrency}`);
  }

  // rate.rate = how many base currency units per 1 unit of fromCurrency
  return amount * rate.rate;
}

/**
 * Convert an amount with a database lookup for the rate.
 */
export async function convertToBaseWithLookup(
  householdId: string,
  amount: number,
  fromCurrency: Currency,
  period: string,
  baseCurrency: Currency = 'ARS'
): Promise<{ converted: number; rate: number | null }> {
  if (fromCurrency === baseCurrency) {
    return { converted: amount, rate: null };
  }

  const rate = await getDbRate(householdId, fromCurrency, period);
  if (!rate) {
    return { converted: amount, rate: null };
  }

  return {
    converted: amount * rate.rate,
    rate: rate.rate,
  };
}

/**
 * Convert multiple transactions to base currency.
 * Uses a batch approach to avoid repeated DB lookups.
 */
export function convertTransactionsToBase(
  transactions: Array<{ amount: number; currency: Currency }>,
  rates: ExchangeRate[],
  baseCurrency: Currency = 'ARS'
): number[] {
  return transactions.map((tx) => {
    try {
      return convertToBase(tx.amount, tx.currency, rates, baseCurrency);
    } catch {
      // If no rate available, return original amount
      return tx.amount;
    }
  });
}

/**
 * Get the total in base currency for a set of transactions.
 */
export function totalInBaseCurrency(
  transactions: Array<{ amount: number; currency: Currency }>,
  rates: ExchangeRate[],
  baseCurrency: Currency = 'ARS'
): number {
  return convertTransactionsToBase(transactions, rates, baseCurrency)
    .reduce((sum, val) => sum + val, 0);
}
