import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { generateSnapshot } from '@/lib/engine/monthly-snapshot';
import type { Currency } from '@/lib/db/types';

interface Params {
  params: Promise<{ householdId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId);

    const url = new URL(request.url);
    const period = url.searchParams.get('period') || getCurrentPeriod();
    const currency = (url.searchParams.get('currency') as Currency) || 'USD';

    const snapshot = await generateSnapshot(householdId, period, currency);
    return NextResponse.json(snapshot);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : 'Snapshot error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
