import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { updateExclusionRule, deleteExclusionRule } from '@/lib/db/categories';
import { UpdateExclusionRuleSchema } from '@/lib/db/schemas';

interface Params {
  params: Promise<{ householdId: string; ruleId: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { householdId, ruleId } = await params;
    await withHouseholdAuth(request, householdId, 'owner');
    const body = await request.json();
    const data = UpdateExclusionRuleSchema.parse(body);
    await updateExclusionRule(householdId, ruleId, data);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : 'Failed to update';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { householdId, ruleId } = await params;
    await withHouseholdAuth(request, householdId, 'owner');
    await deleteExclusionRule(householdId, ruleId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
