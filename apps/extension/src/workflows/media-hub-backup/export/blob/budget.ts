import {
  MAX_BACKUP_ARCHIVE_BYTES,
  MAX_BACKUP_ENTRY_BYTES,
  MAX_BACKUP_TOTAL_INFLATED_BYTES,
} from '../../manifest';

const BACKUP_EXPORT_ZIP_OVERHEAD_RESERVE_BYTES = 16 * 1024 * 1024;
export const MAX_BACKUP_EXPORT_GENERATION_BYTES =
  MAX_BACKUP_ARCHIVE_BYTES - BACKUP_EXPORT_ZIP_OVERHEAD_RESERVE_BYTES;

export interface BackupExportBudget {
  totalBytes: number;
}

export interface BackupZipWriter {
  file: (path: string, blob: Blob) => unknown;
}

interface BackupTextZipWriter {
  file: (path: string, text: string) => unknown;
}

export function createBackupExportBudget(): BackupExportBudget {
  return { totalBytes: 0 };
}

export function appendBackupBlobEntry(args: {
  budget: BackupExportBudget;
  label: string;
  path: string;
  blob: Blob;
  signal?: AbortSignal | undefined;
  zip: BackupZipWriter;
}): void {
  assertBackupExportNotCancelled(args.signal);
  assertBackupBlobSize(args.blob, args.label);
  args.budget.totalBytes += args.blob.size;
  assertBackupExportBudget(args.budget);
  args.zip.file(args.path, args.blob);
}

export function appendBackupTextEntry(args: {
  budget: BackupExportBudget;
  label: string;
  maxBytes?: number;
  path: string;
  signal?: AbortSignal | undefined;
  text: string;
  zip: BackupTextZipWriter;
}): void {
  assertBackupExportNotCancelled(args.signal);
  const byteLength = new TextEncoder().encode(args.text).byteLength;
  if (args.maxBytes !== undefined && byteLength > args.maxBytes) {
    throw new Error(`Media hub backup JSON entry exceeds byte budget: ${args.label}.`);
  }
  args.budget.totalBytes += byteLength;
  assertBackupExportBudget(args.budget);
  args.zip.file(args.path, args.text);
}

export async function generateBackupZipBlob(args: {
  budget: BackupExportBudget;
  signal?: AbortSignal | undefined;
  generate: () => Promise<File>;
  release?: (blob: Blob) => Promise<void>;
}): Promise<Blob> {
  assertBackupExportGenerationAllowed(args.budget, args.signal);
  const blob = await args.generate();
  try {
    assertBackupExportGenerationAllowed(args.budget, args.signal);
    if (typeof blob.size === 'number' && blob.size > MAX_BACKUP_ARCHIVE_BYTES) {
      throw new Error('Media hub backup package exceeds archive byte budget.');
    }
    return blob;
  } catch (error) {
    if (args.release) {
      let releaseError: unknown;
      try {
        await args.release(blob);
      } catch (caughtError) {
        releaseError = caughtError;
      }
      if (releaseError !== undefined) {
        throw new AggregateError(
          [error, releaseError],
          'Media hub backup generation failed and temporary output cleanup was incomplete.',
          { cause: error }
        );
      }
    }
    throw error;
  }
}

function assertBackupExportBudget(budget: BackupExportBudget): void {
  if (
    budget.totalBytes > MAX_BACKUP_TOTAL_INFLATED_BYTES ||
    budget.totalBytes > MAX_BACKUP_EXPORT_GENERATION_BYTES
  ) {
    throw new Error('Media hub backup package exceeds total byte budget.');
  }
}

function assertBackupExportGenerationAllowed(
  budget: BackupExportBudget,
  signal: AbortSignal | undefined
): void {
  assertBackupExportNotCancelled(signal);
  assertBackupExportBudget(budget);
}

export function assertBackupExportNotCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('Media hub backup export was cancelled.', 'AbortError');
  }
}

function assertBackupBlobSize(blob: Blob, label: string): void {
  if (blob.size > MAX_BACKUP_ENTRY_BYTES) {
    throw new Error(`Media hub backup entry exceeds byte budget: ${label}.`);
  }
}
