import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { getRules, createRule } from '@/lib/db/categories';
import { CreateRuleSchema } from '@/lib/db/schemas';

interface Params {
  params: Promise<{ householdId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId);
    const rules = await getRules(householdId);
    return NextResponse.json({ rules });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    const { user } = await withHouseholdAuth(request, householdId, 'owner');
    const body = await request.json();
    const data = CreateRuleSchema.parse(body);
    const rule = await createRule(householdId, { ...data, createdBy: user.uid });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : 'Failed to create rule';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
