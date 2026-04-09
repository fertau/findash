import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { detectSource } from '@/lib/parsing/detector';
import { getImportSources, getImportSourceByFingerprint } from '@/lib/db/import-sources';

interface Params {
  params: Promise<{ householdId: string }>;
}

/**
 * POST /api/households/[householdId]/import/detect
 *
 * Analyzes an uploaded file and returns detection results:
 * - File format (PDF, CSV, XLS, etc.)
 * - Detected institution (Galicia, Santander, Itaú, etc.)
 * - Detected document type (card statement, bank account, etc.)
 * - Confidence level
 * - Whether this matches a previously saved source
 *
 * The client uses this to show a confirmation step before importing.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    await withHouseholdAuth(request, householdId);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const detection = detectSource(buffer, file.name, file.type);

    // Check if this fingerprint matches a previously saved source
    let matchedSource = null;
    if (detection.fingerprintHash) {
      matchedSource = await getImportSourceByFingerprint(householdId, detection.fingerprintHash);
    }

    // Also load all household sources for the UI to show alternatives
    const householdSources = await getImportSources(householdId);

    if (matchedSource) {
      return NextResponse.json({
        ...detection,
        matchedSourceId: matchedSource.id,
        matchedSourceLabel: matchedSource.label,
        // Override detection with saved source data
        parserKey: matchedSource.parserKey,
        institution: matchedSource.institution,
        documentType: matchedSource.documentType,
        confidence: 'high' as const,
        isKnownSource: true,
        householdSources,
      });
    }

    return NextResponse.json({
      ...detection,
      isKnownSource: false,
      householdSources,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : 'Detection failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
