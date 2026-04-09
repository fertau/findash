import { NextResponse } from 'next/server';
import { withHouseholdAuth } from '@/lib/auth/permissions';
import { getImportBatch, updateImportBatch } from '@/lib/db/import-log';
import { hardDeleteTransactionsByBatch } from '@/lib/db/transactions';

interface Params {
  params: Promise<{ householdId: string; batchId: string }>;
}

/**
 * GET /api/households/[householdId]/import/[batchId]
 * Get import batch details
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { householdId, batchId } = await params;
    await withHouseholdAuth(request, householdId);

    const batch = await getImportBatch(householdId, batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Import batch not found' }, { status: 404 });
    }

    return NextResponse.json({ batch });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * DELETE /api/households/[householdId]/import/[batchId]
 * Hard-delete all transactions from this batch and mark batch as deleted
 */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { householdId, batchId } = await params;
    await withHouseholdAuth(request, householdId, 'owner');

    const batch = await getImportBatch(householdId, batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Import batch not found' }, { status: 404 });
    }

    if (batch.status === 'deleted') {
      return NextResponse.json({ error: 'Batch already deleted' }, { status: 400 });
    }

    // Hard-delete all transactions from this batch
    const deletedCount = await hardDeleteTransactionsByBatch(householdId, batchId);

    // Soft-delete the batch record (keep for audit trail)
    await updateImportBatch(householdId, batchId, { status: 'deleted' });

    return NextResponse.json({
      success: true,
      transactionsDeleted: deletedCount,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
