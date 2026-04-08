import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { getCardMappings, createCardMapping } from '@/lib/db/households';
import { CreateCardMappingSchema } from '@/lib/db/schemas';

interface Params {
  params: Promise<{ householdId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId);
    const cards = await getCardMappings(householdId);
    return NextResponse.json({ cards });
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
    const data = CreateCardMappingSchema.parse(body);
    const card = await createCardMapping(householdId, data);
    return NextResponse.json({ card }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : 'Failed to create card mapping';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
