import { appendBackupBlobEntry, type BackupExportBudget, type BackupZipWriter } from './budget';

export function createBackupBlobDescriptor<T extends { blob: Blob }>(
  zip: BackupZipWriter,
  budget: BackupExportBudget,
  path: string,
  entry: T,
  signal?: AbortSignal | undefined
) {
  const { blob, ...entryWithoutBlob } = entry;
  appendBackupBlobEntry({
    blob,
    budget,
    label: path,
    path,
    signal,
    zip,
  });
  return {
    blobPath: path,
    entry: entryWithoutBlob,
  };
}
