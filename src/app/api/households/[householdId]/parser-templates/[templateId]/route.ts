import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { getParserTemplate, updateParserTemplate, deleteParserTemplate } from '@/lib/db/parser-templates';
import { validateTemplate } from '@/lib/parsing/template-parser';

interface Params {
  params: Promise<{ householdId: string; templateId: string }>;
}

/** GET — Get a single template */
export async function GET(request: Request, { params }: Params) {
  const { householdId, templateId } = await params;
  await withHouseholdAuth(request, householdId);
  const template = await getParserTemplate(householdId, templateId);
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  return NextResponse.json(template);
}

/** PATCH — Update a template */
export async function PATCH(request: Request, { params }: Params) {
  const { householdId, templateId } = await params;
  await withHouseholdAuth(request, householdId);

  const body = await request.json();
  const errors = validateTemplate(body);
  // Allow partial updates — only validate fields that are present
  const criticalErrors = errors.filter((e) =>
    body[e.field] !== undefined
  );
  if (criticalErrors.length > 0) {
    return NextResponse.json({ errors: criticalErrors }, { status: 400 });
  }

  await updateParserTemplate(householdId, templateId, body);
  const updated = await getParserTemplate(householdId, templateId);
  return NextResponse.json(updated);
}

/** DELETE — Delete a template */
export async function DELETE(request: Request, { params }: Params) {
  const { householdId, templateId } = await params;
  await withHouseholdAuth(request, householdId);
  await deleteParserTemplate(householdId, templateId);
  return NextResponse.json({ ok: true });
}
