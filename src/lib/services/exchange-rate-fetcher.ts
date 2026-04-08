import { getRate, setRate } from '@/lib/db/exchange-rates';
import type { Currency } from '@/lib/db/types';

const DOLAR_API_URL = 'https://dolarapi.com/v1/dolares';
const BCU_PROXY_URL = 'https://dolarapi.com/v1/cotizaciones/uyu';

interface FetchedRate {
  currency: Currency;
  rate: number;
  source: string;
}

/**
 * Fetch current exchange rates from public APIs.
 * DolarAPI.com provides ARS rates (blue, MEP, oficial).
 * For UYU, uses DolarAPI's UYU endpoint.
 */
export async function fetchCurrentRates(): Promise<FetchedRate[]> {
  const results: FetchedRate[] = [];

  // Fetch USD/ARS rates
  try {
    const res = await fetch(DOLAR_API_URL, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      // Find "blue" rate (most commonly used for real transactions)
      const blue = data.find((d: { casa: string }) => d.casa === 'blue');
      if (blue?.venta) {
        results.push({
          currency: 'USD',
          rate: blue.venta,
          source: 'dolarapi.com (blue)',
        });
      }
    }
  } catch {
    // DolarAPI down, skip
  }

  // Fetch UYU rate
  try {
    const res = await fetch(BCU_PROXY_URL, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      if (data?.venta) {
        results.push({
          currency: 'UYU',
          rate: data.venta,
          source: 'dolarapi.com (uyu)',
        });
      }
    }
  } catch {
    // BCU proxy down, skip
  }

  return results;
}

/**
 * Fetch and store rates for a household, with sanity check.
 * If the fetched rate differs from the last known rate by more than 30%,
 * it flags the rate as needing manual confirmation instead of auto-saving.
 */
export async function fetchAndStoreRates(
  householdId: string,
  period: string
): Promise<{ stored: FetchedRate[]; flagged: FetchedRate[]; errors: string[] }> {
  const fetched = await fetchCurrentRates();
  const stored: FetchedRate[] = [];
  const flagged: FetchedRate[] = [];
  const errors: string[] = [];

  for (const rate of fetched) {
    try {
      // Sanity check: compare with last known rate
      const existing = await getRate(householdId, rate.currency, period);

      if (existing) {
        const delta = Math.abs(rate.rate - existing.rate) / existing.rate;
        if (delta > 0.3) {
          // Rate changed by more than 30%, flag for manual confirmation
          flagged.push(rate);
          continue;
        }
      }

      await setRate(householdId, rate.currency, period, rate.rate, 'api');
      stored.push(rate);
    } catch (err) {
      errors.push(`Failed to store ${rate.currency} rate: ${err}`);
    }
  }

  return { stored, flagged, errors };
}
