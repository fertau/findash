import { exchangeRatesCollection } from '@/lib/firebase/admin';
import { nowISO } from '@/lib/utils';
import type { ExchangeRate, Currency } from './types';

export async function getExchangeRates(householdId: string): Promise<ExchangeRate[]> {
  const snap = await exchangeRatesCollection(householdId)
    .orderBy('period', 'desc')
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ExchangeRate);
}

export async function getRate(
  householdId: string,
  currency: Currency,
  period: string
): Promise<ExchangeRate | null> {
  // Try exact period match first
  const exactSnap = await exchangeRatesCollection(householdId)
    .where('currency', '==', currency)
    .where('period', '==', period)
    .limit(1)
    .get();

  if (!exactSnap.empty) {
    return { id: exactSnap.docs[0].id, ...exactSnap.docs[0].data() } as ExchangeRate;
  }

  // Fallback: most recent rate for this currency
  const fallbackSnap = await exchangeRatesCollection(householdId)
    .where('currency', '==', currency)
    .orderBy('period', 'desc')
    .limit(1)
    .get();

  if (!fallbackSnap.empty) {
    return { id: fallbackSnap.docs[0].id, ...fallbackSnap.docs[0].data() } as ExchangeRate;
  }

  return null;
}

export async function setRate(
  householdId: string,
  currency: Currency,
  period: string,
  rate: number,
  source: 'manual' | 'api' = 'manual'
): Promise<ExchangeRate> {
  const now = nowISO();

  // Check if rate already exists for this currency+period
  const existing = await exchangeRatesCollection(householdId)
    .where('currency', '==', currency)
    .where('period', '==', period)
    .limit(1)
    .get();

  if (!existing.empty) {
    const doc = existing.docs[0];
    await doc.ref.update({ rate, source, updatedAt: now });
    return { id: doc.id, currency, period, rate, source, updatedAt: now };
  }

  const data = { currency, period, rate, source, updatedAt: now };
  const ref = await exchangeRatesCollection(householdId).add(data);
  return { id: ref.id, ...data };
}

export async function getRatesForPeriod(
  householdId: string,
  period: string
): Promise<ExchangeRate[]> {
  const snap = await exchangeRatesCollection(householdId)
    .where('period', '==', period)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ExchangeRate);
}
