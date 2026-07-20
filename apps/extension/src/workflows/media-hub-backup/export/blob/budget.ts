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

interface BackupZipGenerator {
  generateAsync: (options: { type: 'blob' }, onUpdate?: () => void) => Promise<Blob>;
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
  zip: BackupZipGenerator;
}): Promise<Blob> {
  assertBackupExportGenerationAllowed(args.budget, args.signal);
  const blob = await args.zip.generateAsync({ type: 'blob' }, () => {
    assertBackupExportGenerationAllowed(args.budget, args.signal);
  });
  assertBackupExportGenerationAllowed(args.budget, args.signal);
  if (typeof blob.size === 'number' && blob.size > MAX_BACKUP_ARCHIVE_BYTES) {
    throw new Error('Media hub backup package exceeds archive byte budget.');
  }
  return blob;
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
