import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { fetchAndStoreRates } from '@/lib/services/exchange-rate-fetcher';

interface Params {
  params: Promise<{ householdId: string }>;
}

/**
 * POST /api/households/[householdId]/exchange-rates/fetch
 * Fetch current exchange rates from DolarAPI.com and store them.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId, 'owner');

    const url = new URL(request.url);
    const period = url.searchParams.get('period') || getCurrentPeriod();

    const result = await fetchAndStoreRates(householdId, period);

    return NextResponse.json({
      stored: result.stored.map((r) => ({ currency: r.currency, rate: r.rate, source: r.source })),
      flagged: result.flagged.map((r) => ({
        currency: r.currency,
        rate: r.rate,
        reason: 'Rate changed >30% from last known, needs manual confirmation',
      })),
      errors: result.errors,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : 'Failed to fetch rates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
