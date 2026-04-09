import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { getParserTemplates, createParserTemplate } from '@/lib/db/parser-templates';
import { validateTemplate } from '@/lib/parsing/template-parser';
import type { ParserTemplate } from '@/lib/db/types';

interface Params {
  params: Promise<{ householdId: string }>;
}

/** GET /api/households/[householdId]/parser-templates — List all templates */
export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;
  await withHouseholdAuth(request, householdId);
  const templates = await getParserTemplates(householdId);
  return NextResponse.json(templates);
}

/** POST /api/households/[householdId]/parser-templates — Create a new template */
export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;
  const { user } = await withHouseholdAuth(request, householdId);

  const body = await request.json();
  const errors = validateTemplate(body);
  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const template = await createParserTemplate(householdId, {
    householdId,
    label: body.label,
    institution: body.institution,
    documentType: body.documentType || (body.negateAmounts ? 'Tarjeta' : 'Cuenta'),
    fingerprints: body.fingerprints || [],
    sectionStart: body.sectionStart,
    sectionEnd: body.sectionEnd,
    dateFormat: body.dateFormat,
    skipPatterns: body.skipPatterns || [],
    pageHeaderPattern: body.pageHeaderPattern,
    hasTrailingMinus: body.hasTrailingMinus ?? false,
    hasBalanceColumn: body.hasBalanceColumn ?? false,
    defaultCurrency: body.defaultCurrency,
    dualCurrency: body.dualCurrency,
    negateAmounts: body.negateAmounts ?? false,
    continuationMinIndent: body.continuationMinIndent,
    descriptionCleanup: body.descriptionCleanup,
    createdBy: user.uid,
  });

  return NextResponse.json(template, { status: 201 });
}
