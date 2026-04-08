import { getRate, setRate } from '@/lib/db/exchange-rates';
import type { Currency } from '@/lib/db/types';

/**
 * Exchange rate provider configuration.
 * Each provider knows how to fetch a specific currency pair.
 * Add new providers here to support additional currencies/regions.
 */
interface RateProvider {
  currency: Currency;
  url: string;
  extractRate: (data: unknown) => number | null;
  sourceName: string;
}

const RATE_PROVIDERS: RateProvider[] = [
  {
    currency: 'USD',
    url: 'https://dolarapi.com/v1/dolares',
    extractRate: (data) => {
      if (!Array.isArray(data)) return null;
      const blue = data.find((d: Record<string, unknown>) => d.casa === 'blue');
      return blue?.venta ?? null;
    },
    sourceName: 'dolarapi.com',
  },
  {
    currency: 'UYU',
    url: 'https://dolarapi.com/v1/cotizaciones/uyu',
    extractRate: (data) => {
      const d = data as Record<string, unknown>;
      return (d?.venta as number) ?? null;
    },
    sourceName: 'dolarapi.com',
  },
];

interface FetchedRate {
  currency: Currency;
  rate: number;
  source: string;
}

/**
 * Fetch current exchange rates from configured providers.
 * Each provider is independent — if one fails, others still work.
 */
export async function fetchCurrentRates(): Promise<FetchedRate[]> {
  const results: FetchedRate[] = [];

  for (const provider of RATE_PROVIDERS) {
    try {
      const res = await fetch(provider.url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;

      const data = await res.json();
      const rate = provider.extractRate(data);

      if (rate && rate > 0) {
        results.push({
          currency: provider.currency,
          rate,
          source: provider.sourceName,
        });
      }
    } catch {
      // Provider unavailable, skip
    }
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
      const existing = await getRate(householdId, rate.currency, period);

      if (existing) {
        const delta = Math.abs(rate.rate - existing.rate) / existing.rate;
        if (delta > 0.3) {
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
