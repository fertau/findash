import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { handleFileUpload } from '@/lib/parsing/upload';
import { ImportUploadSchema } from '@/lib/db/schemas';

interface Params {
  params: Promise<{ householdId: string }>;
}

/**
 * POST /api/households/[householdId]/import — Upload and parse a statement file
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { householdId } = await params;
    const { user, member } = await withHouseholdAuth(request, householdId);

    if (!member.canUpload) {
      return NextResponse.json(
        { error: 'You do not have upload permissions' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const sourceId = formData.get('sourceId') as string | null;
    const memberId = formData.get('memberId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const metadata = ImportUploadSchema.parse({
      sourceId: sourceId || '',
      memberId: memberId || user.uid,
    });

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await handleFileUpload(
      householdId,
      {
        buffer,
        fileName: file.name,
        mimeType: file.type,
      },
      metadata.sourceId,
      metadata.memberId,
      user.uid
    );

    const status = result.importBatch.status === 'error' ? 500 : 200;
    return NextResponse.json(
      {
        importBatchId: result.importBatch.id,
        status: result.importBatch.status,
        transactionsImported: result.transactionsImported,
        duplicatesSkipped: result.duplicatesSkipped,
        errors: result.errors,
      },
      { status }
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
