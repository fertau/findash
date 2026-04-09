import { createHash } from 'crypto';
import { getAdminStorage } from '@/lib/firebase/admin';
import { createImportBatch, updateImportBatch, findImportByHash } from '@/lib/db/import-log';
import { batchCreateTransactions } from '@/lib/db/transactions';
import { getRules, getExclusionRules, getCategories } from '@/lib/db/categories';
import { getMembers, getCardMappings } from '@/lib/db/households';
import { processTransactions, type ProcessorContext } from '@/lib/engine/processor';
import { parseFile } from './parser-factory';
import type { ImportBatch } from '@/lib/db/types';

export interface UploadResult {
  importBatch: ImportBatch;
  transactionsImported: number;
  duplicatesSkipped: number;
  errors: string[];
}

/**
 * Handle a file upload: store file, parse, process, and persist transactions.
 * This is the main import orchestrator.
 */
export async function handleFileUpload(
  householdId: string,
  file: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  },
  sourceId: string,
  memberId: string,
  userId: string
): Promise<UploadResult> {
  // Step 1: Compute file hash for idempotency
  const fileHash = createHash('sha256').update(file.buffer).digest('hex');

  // Step 2: Check if this file was already imported
  const existingImport = await findImportByHash(householdId, fileHash);
  if (existingImport) {
    return {
      importBatch: { ...existingImport, status: 'skipped' },
      transactionsImported: 0,
      duplicatesSkipped: existingImport.transactionCount,
      errors: [],
    };
  }

  // Step 3: Create import batch record
  const importBatch = await createImportBatch(householdId, {
    fileName: file.fileName,
    fileHash,
    sourceId,
    importedBy: userId,
  });

  try {
    // Step 4: Upload file to Firebase Storage (non-blocking, skip on failure)
    try {
      const storagePath = `imports/${householdId}/${importBatch.id}/${file.fileName}`;
      const bucket = getAdminStorage().bucket();
      const fileRef = bucket.file(storagePath);
      await fileRef.save(file.buffer, {
        metadata: { contentType: file.mimeType },
      });
    } catch {
      // Storage not configured or unavailable — continue without archiving
    }

    // Step 5: Parse file (pass householdId so template parsers can be tried)
    const parseResult = await parseFile(file.buffer, file.fileName, sourceId, householdId);

    if (parseResult.transactions.length === 0) {
      await updateImportBatch(householdId, importBatch.id, {
        status: 'error',
        notes: 'No se encontraron transacciones en el archivo. Verificá que el formato sea correcto.',
      });
      return {
        importBatch: { ...importBatch, status: 'error', notes: 'No se encontraron transacciones en el archivo' },
        transactionsImported: 0,
        duplicatesSkipped: 0,
        errors: ['No se encontraron transacciones en el archivo'],
      };
    }

    // Step 6: Load household rules and context
    const [rules, exclusionRules, members, cardMappings, categories] = await Promise.all([
      getRules(householdId),
      getExclusionRules(householdId),
      getMembers(householdId),
      getCardMappings(householdId),
      getCategories(householdId),
    ]);

    const processorCtx: ProcessorContext = {
      householdId,
      sourceId,
      memberId,
      importBatchId: importBatch.id,
      rules,
      exclusionRules,
      members,
      cardMappings,
      categories,
    };

    // Step 7: Process transactions (normalize, dedup, categorize, etc.)
    const processResult = await processTransactions(parseResult.transactions, processorCtx);

    // Step 8: Batch write to Firestore
    let transactionsImported = 0;
    if (processResult.transactions.length > 0) {
      await batchCreateTransactions(householdId, processResult.transactions);
      transactionsImported = processResult.transactions.length;
    }

    // Step 9: Update import batch record
    const status = processResult.errors.length > 0 ? 'partial' : 'success';
    await updateImportBatch(householdId, importBatch.id, {
      status,
      transactionCount: transactionsImported,
      duplicatesSkipped: processResult.duplicatesSkipped,
      ...(parseResult.period ? { period: parseResult.period } : {}),
      ...(processResult.errors.length > 0 ? { notes: `${processResult.errors.length} errors during processing` } : {}),
    });

    return {
      importBatch: {
        ...importBatch,
        status,
        transactionCount: transactionsImported,
        duplicatesSkipped: processResult.duplicatesSkipped,
        period: parseResult.period,
      },
      transactionsImported,
      duplicatesSkipped: processResult.duplicatesSkipped,
      errors: processResult.errors,
    };
  } catch (error) {
    // Update import batch with error status — include full context
    const message = error instanceof Error ? error.message : 'Unknown error';
    await updateImportBatch(householdId, importBatch.id, {
      status: 'error',
      notes: message,
    });

    return {
      importBatch: { ...importBatch, status: 'error', notes: message },
      transactionsImported: 0,
      duplicatesSkipped: 0,
      errors: [message],
    };
  }
}
