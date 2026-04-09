import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { testTemplate, validateTemplate } from '@/lib/parsing/template-parser';
import type { ParserTemplate } from '@/lib/db/types';

interface Params {
  params: Promise<{ householdId: string }>;
}

/**
 * POST /api/households/[householdId]/parser-templates/test
 *
 * Test a template configuration against PDF text without saving.
 * Body: { template: ParserTemplate, text: string }
 * Returns: { transactions, lineCount, sectionFound, errors? }
 *
 * Used by the template builder UI for real-time preview.
 */
export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;
  await withHouseholdAuth(request, householdId);

  const body = await request.json();
  const { template, text } = body as { template: Partial<ParserTemplate>; text: string };

  if (!text) {
    return NextResponse.json({ error: 'Se requiere el texto del PDF' }, { status: 400 });
  }

  const validationErrors = validateTemplate(template);
  if (validationErrors.length > 0) {
    return NextResponse.json({ errors: validationErrors, transactions: [], lineCount: 0, sectionFound: false }, { status: 400 });
  }

  const result = testTemplate(template as ParserTemplate, text);

  return NextResponse.json({
    transactions: result.transactions.slice(0, 50), // limit preview
    totalTransactions: result.transactions.length,
    lineCount: result.lineCount,
    sectionFound: result.sectionFound,
  });
}
