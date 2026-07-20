import { remapEntryForDuplicate } from './duplicate';
import { importMediaHubBackupAssets } from '../restore';
import { loadBackupParts } from '../manifest';
import { createMediaHubStorageHeadroomError } from '../../../features/media-hub/storage-errors';
import { ensureMediaHubStorageHeadroom } from '../../../features/media-hub/storage-capacity';
import type { MediaHubImportConflictStrategy, MediaHubImportResult } from '../contracts/types';

export async function importMediaHubBackup(
  file: Blob,
  strategy: MediaHubImportConflictStrategy
): Promise<MediaHubImportResult> {
  const { inflatedSizeBytes, metadata, zip } = await loadBackupParts(file);
  await ensureBackupImportStorageHeadroom(inflatedSizeBytes);

  return importMediaHubBackupAssets({
    metadata,
    remapEntryForDuplicate,
    strategy,
    zip,
  });
}

async function ensureBackupImportStorageHeadroom(inflatedSizeBytes: number): Promise<void> {
  try {
    await ensureMediaHubStorageHeadroom(inflatedSizeBytes);
  } catch (error) {
    throw createMediaHubStorageHeadroomError(error) ?? error;
  }
}
