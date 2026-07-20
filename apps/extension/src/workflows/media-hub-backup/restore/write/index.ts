import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import type { WebSnapshotRecord } from '../../../../composition/persistence/web-snapshots/contracts';
import {
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  RECORDING_TELEMETRY_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  WEB_SNAPSHOTS_STORE,
} from '../../storage/constants';
import {
  createProjectAssetStoreEntry,
  createProjectExportStoreEntry,
  createRecordingStoreEntry,
  createThumbnailStoreEntry,
} from '../records/builders';
import { getStore } from '../../storage';
import { assertSafeProjectAssetStorageInput } from '../../../../features/media-hub/project-assets';
export {
  assertBackupImportWritePreflightComplete,
  commitBackupTransaction,
  getImportTransactionStoreNames,
} from './transaction';

type BackupTransaction = Parameters<typeof getStore>[0];

export interface BackupImportAssetRecordSnapshot {
  mediaLibraryEntry: unknown;
  projectAssetEntry: unknown;
  projectExportEntry: unknown;
  recordingEntry: unknown;
  recordingTelemetryEntry: unknown;
  thumbnailEntry: unknown;
  webSnapshotEntry: unknown;
}

export async function deleteExistingAssetRecord(
  tx: BackupTransaction,
  entry: Omit<MediaLibraryEntry, 'blob'>
): Promise<void> {
  if (entry.source.kind === 'recording') {
    await getStore(tx, STORE_NAME).delete(entry.source.recordingId);
    await getStore(tx, RECORDING_TELEMETRY_STORE).delete(entry.source.recordingId);
  } else if (entry.source.kind === 'project-export') {
    await getStore(tx, STORE_NAME).delete(entry.source.recordingId);
    await getStore(tx, PROJECT_EXPORTS_STORE).delete(entry.source.exportId);
    await getStore(tx, RECORDING_TELEMETRY_STORE).delete(entry.source.recordingId);
  } else if (entry.source.kind === 'project-asset') {
    await getStore(tx, PROJECT_ASSETS_STORE).delete(entry.source.projectAssetId);
  } else if (entry.source.kind === 'web-snapshot') {
    await getStore(tx, WEB_SNAPSHOTS_STORE).delete(entry.source.snapshotId);
  }

  await getStore(tx, MEDIA_LIBRARY_STORE).delete(entry.id);
  await getStore(tx, THUMBNAILS_STORE).delete(entry.id);
}

export async function snapshotExistingAssetRecord(
  tx: BackupTransaction,
  entry: Omit<MediaLibraryEntry, 'blob'>
): Promise<BackupImportAssetRecordSnapshot> {
  const snapshot: BackupImportAssetRecordSnapshot = {
    mediaLibraryEntry: await getStore(tx, MEDIA_LIBRARY_STORE).get(entry.id),
    projectAssetEntry: undefined,
    projectExportEntry: undefined,
    recordingEntry: undefined,
    recordingTelemetryEntry: undefined,
    thumbnailEntry: await getStore(tx, THUMBNAILS_STORE).get(entry.id),
    webSnapshotEntry: undefined,
  };

  if (entry.source.kind === 'recording') {
    snapshot.recordingEntry = await getStore(tx, STORE_NAME).get(entry.source.recordingId);
    snapshot.recordingTelemetryEntry = await getStore(tx, RECORDING_TELEMETRY_STORE).get(
      entry.source.recordingId
    );
  } else if (entry.source.kind === 'project-export') {
    snapshot.recordingEntry = await getStore(tx, STORE_NAME).get(entry.source.recordingId);
    snapshot.projectExportEntry = await getStore(tx, PROJECT_EXPORTS_STORE).get(
      entry.source.exportId
    );
    snapshot.recordingTelemetryEntry = await getStore(tx, RECORDING_TELEMETRY_STORE).get(
      entry.source.recordingId
    );
  } else if (entry.source.kind === 'project-asset') {
    snapshot.projectAssetEntry = await getStore(tx, PROJECT_ASSETS_STORE).get(
      entry.source.projectAssetId
    );
  } else if (entry.source.kind === 'web-snapshot') {
    snapshot.webSnapshotEntry = await getStore(tx, WEB_SNAPSHOTS_STORE).get(
      entry.source.snapshotId
    );
  }

  return snapshot;
}

async function restoreSnapshotEntry(
  tx: BackupTransaction,
  storeName: string,
  entry: unknown
): Promise<void> {
  if (entry === undefined) {
    return;
  }

  await getStore(tx, storeName).put(entry);
}

export async function restoreAssetRecordSnapshot(
  tx: BackupTransaction,
  snapshot: BackupImportAssetRecordSnapshot
): Promise<void> {
  await restoreSnapshotEntry(tx, STORE_NAME, snapshot.recordingEntry);
  await restoreSnapshotEntry(tx, RECORDING_TELEMETRY_STORE, snapshot.recordingTelemetryEntry);
  await restoreSnapshotEntry(tx, PROJECT_ASSETS_STORE, snapshot.projectAssetEntry);
  await restoreSnapshotEntry(tx, PROJECT_EXPORTS_STORE, snapshot.projectExportEntry);
  await restoreSnapshotEntry(tx, WEB_SNAPSHOTS_STORE, snapshot.webSnapshotEntry);
  await restoreSnapshotEntry(tx, MEDIA_LIBRARY_STORE, snapshot.mediaLibraryEntry);
  await restoreSnapshotEntry(tx, THUMBNAILS_STORE, snapshot.thumbnailEntry);
}

export async function writeMainAssetRecord(
  tx: BackupTransaction,
  entry: Omit<MediaLibraryEntry, 'blob'>,
  blob: Blob,
  recordingTelemetry: RecordingTelemetryEntry | null,
  webSnapshotRecord: WebSnapshotRecord | null = null
): Promise<void> {
  if (entry.source.kind === 'screenshot') {
    await getStore(tx, MEDIA_LIBRARY_STORE).put({ ...entry, blob } satisfies MediaLibraryEntry);
    return;
  }

  if (entry.source.kind === 'recording') {
    await getStore(tx, STORE_NAME).put(
      createRecordingStoreEntry(entry.source.recordingId, entry, blob)
    );
    if (recordingTelemetry) {
      await getStore(tx, RECORDING_TELEMETRY_STORE).put(recordingTelemetry);
    }
    await getStore(tx, MEDIA_LIBRARY_STORE).put(entry);
    return;
  }

  if (entry.source.kind === 'project-export') {
    await getStore(tx, STORE_NAME).put(
      createRecordingStoreEntry(entry.source.recordingId, entry, blob)
    );
    await getStore(tx, PROJECT_EXPORTS_STORE).put(createProjectExportStoreEntry(entry, blob));
    await getStore(tx, MEDIA_LIBRARY_STORE).put(entry);
    return;
  }

  if (entry.source.kind === 'web-snapshot') {
    if (!webSnapshotRecord) {
      throw new Error('Web snapshot backup record is missing.');
    }

    await getStore(tx, WEB_SNAPSHOTS_STORE).put(webSnapshotRecord);
    await getStore(tx, MEDIA_LIBRARY_STORE).put(entry);
    return;
  }

  assertSafeProjectAssetStorageInput(blob, entry.mimeType);
  await getStore(tx, PROJECT_ASSETS_STORE).put(createProjectAssetStoreEntry(entry, blob));
  await getStore(tx, MEDIA_LIBRARY_STORE).put(entry);
}

export async function writeThumbnailRecord(
  tx: BackupTransaction,
  entry: Omit<MediaLibraryEntry, 'blob'>,
  thumbnail: Blob | null
): Promise<void> {
  if (!thumbnail) {
    return;
  }

  await getStore(tx, THUMBNAILS_STORE).put(createThumbnailStoreEntry(entry, thumbnail));
}

export async function restoreAssetRecord(
  tx: BackupTransaction,
  entry: Omit<MediaLibraryEntry, 'blob'>,
  blob: Blob,
  thumbnail: Blob | null,
  recordingTelemetry: RecordingTelemetryEntry | null = null,
  webSnapshotRecord: WebSnapshotRecord | null = null
): Promise<void> {
  await writeMainAssetRecord(tx, entry, blob, recordingTelemetry, webSnapshotRecord);
  await writeThumbnailRecord(tx, entry, thumbnail);
}
