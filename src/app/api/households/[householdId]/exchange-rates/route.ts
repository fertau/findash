import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { getExchangeRates, setRate } from '@/lib/db/exchange-rates';
import { SetExchangeRateSchema } from '@/lib/db/schemas';

interface Params {
  params: Promise<{ householdId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId);
    const rates = await getExchangeRates(householdId);
    return NextResponse.json({ rates });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId, 'owner');
    const body = await request.json();
    const data = SetExchangeRateSchema.parse(body);
    const rate = await setRate(householdId, data.currency, data.period, data.rate, data.source);
    return NextResponse.json({ rate }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : 'Failed to set rate';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
