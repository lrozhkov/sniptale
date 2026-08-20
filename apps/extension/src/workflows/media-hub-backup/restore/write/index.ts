import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import type { PreparedBackupWebSnapshotRecord } from '../web-snapshot';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  IMAGE_WORKSPACES_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  RECORDING_TELEMETRY_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  WEB_SNAPSHOTS_STORE,
} from '../../storage/constants';
import type { ImageWorkspaceEntry } from '../../../../composition/persistence/image-workspaces/contracts';
import type { AggregatePresentationEntry } from '../../../../composition/persistence/aggregate-presentations/contracts';
import {
  createProjectAssetStoreEntry,
  createProjectExportStoreEntry,
  createRecordingStoreEntry,
  createThumbnailStoreEntry,
} from '../records/builders';
import { getStore } from '../../storage';
import { assertSafeProjectAssetStorageMetadata } from '../../../../features/media-hub/project-assets';
import type { PreparedRestoreRecordingAsset } from '../prepare';
import { parseRecordingEntry } from '../../../../composition/persistence/recordings/index.guards';
import {
  RECORDING_ASSET_OWNER_KIND,
  RECORDING_ASSET_ROLE,
} from '../../../../composition/persistence/recordings/asset-publication';
import {
  PROJECT_ASSET_OWNER_KIND,
  PROJECT_EXPORT_OWNER_KIND,
  PROJECT_MEDIA_ASSET_ROLE,
} from '../../../../composition/persistence/projects/asset-publication';
import {
  parseProjectAssetEntry,
  parseProjectExportEntry,
} from '../../../../composition/persistence/projects/read-guards';
import { parseImageWorkspaceEntry } from '../../../../composition/persistence/image-workspaces/parser';
import { parseStoredWebSnapshotRecord } from '../../../../composition/persistence/web-snapshots';
import {
  WEB_SNAPSHOT_OWNER_KIND,
  WEB_SNAPSHOT_PACKAGE_ROLE,
  WEB_SNAPSHOT_SCREENSHOT_ROLE,
} from '../../../../composition/persistence/web-snapshots/publication';
import { markWebSnapshotProvenanceSanitized } from '../../../../composition/persistence/web-snapshots/provenance-state';
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
  imageWorkspaceEntry: unknown;
  aggregatePresentationEntry: unknown;
  assetOwnerEntry: unknown;
  assetRefEntry: unknown;
  assetOwnerEntries: unknown[];
  assetRefEntries: unknown[];
}

async function removeAssetOwnerAndUnreferencedRef(
  tx: BackupTransaction,
  ownerKey: [string, string, string],
  assetId: string | null
): Promise<void> {
  const ownerStore = getStore(tx, ASSET_OWNERS_STORE);
  await ownerStore.delete(ownerKey);
  if (assetId && (await ownerStore.index('assetId').getAll(assetId)).length === 0) {
    await getStore(tx, ASSET_REFS_STORE).delete(assetId);
  }
}

export async function deleteExistingAssetRecord(
  tx: BackupTransaction,
  entry: Omit<MediaLibraryEntry, 'blob'>
): Promise<void> {
  if (
    entry.source.kind === 'screenshot' &&
    parseImageWorkspaceEntry(await getStore(tx, IMAGE_WORKSPACES_STORE).get(entry.id))
  ) {
    throw new Error(
      'Legacy backup replace cannot overwrite a file-backed image workspace; use skip or duplicate.'
    );
  }
  if (entry.source.kind === 'recording') {
    const stored = parseRecordingEntry(
      await getStore(tx, STORE_NAME).get(entry.source.recordingId)
    );
    await getStore(tx, STORE_NAME).delete(entry.source.recordingId);
    await removeAssetOwnerAndUnreferencedRef(
      tx,
      [RECORDING_ASSET_OWNER_KIND, entry.source.recordingId, RECORDING_ASSET_ROLE],
      stored?.assetId ?? null
    );
    await getStore(tx, RECORDING_TELEMETRY_STORE).delete(entry.source.recordingId);
  } else if (entry.source.kind === 'project-export') {
    const stored = parseProjectExportEntry(
      await getStore(tx, PROJECT_EXPORTS_STORE).get(entry.source.exportId)
    );
    await removeAssetOwnerAndUnreferencedRef(
      tx,
      [PROJECT_EXPORT_OWNER_KIND, entry.source.exportId, PROJECT_MEDIA_ASSET_ROLE],
      stored?.assetId ?? null
    );
    await getStore(tx, PROJECT_EXPORTS_STORE).delete(entry.source.exportId);
  } else if (entry.source.kind === 'project-asset') {
    const stored = parseProjectAssetEntry(
      await getStore(tx, PROJECT_ASSETS_STORE).get(entry.source.projectAssetId)
    );
    await getStore(tx, PROJECT_ASSETS_STORE).delete(entry.source.projectAssetId);
    await removeAssetOwnerAndUnreferencedRef(
      tx,
      [PROJECT_ASSET_OWNER_KIND, entry.source.projectAssetId, PROJECT_MEDIA_ASSET_ROLE],
      stored?.assetId ?? null
    );
  } else if (entry.source.kind === 'web-snapshot') {
    const stored = parseStoredWebSnapshotRecord(
      await getStore(tx, WEB_SNAPSHOTS_STORE).get(entry.source.snapshotId)
    );
    if (stored) {
      for (const [assetId, role] of [
        [stored.packageAssetId, WEB_SNAPSHOT_PACKAGE_ROLE],
        [stored.screenshotAssetId, WEB_SNAPSHOT_SCREENSHOT_ROLE],
      ] as const) {
        await removeAssetOwnerAndUnreferencedRef(
          tx,
          [WEB_SNAPSHOT_OWNER_KIND, stored.id, role],
          assetId
        );
      }
    }
    await getStore(tx, WEB_SNAPSHOTS_STORE).delete(entry.source.snapshotId);
  }

  await getStore(tx, MEDIA_LIBRARY_STORE).delete(entry.id);
  await getStore(tx, THUMBNAILS_STORE).delete(entry.id);
  if (entry.source.kind === 'screenshot') {
    await getStore(tx, IMAGE_WORKSPACES_STORE).delete(entry.id);
    await getStore(tx, AGGREGATE_PRESENTATIONS_STORE).delete(['image', entry.id]);
  }
}

async function snapshotWebSnapshotOwnership(
  tx: BackupTransaction,
  snapshotId: string,
  snapshot: BackupImportAssetRecordSnapshot
): Promise<void> {
  snapshot.webSnapshotEntry = await getStore(tx, WEB_SNAPSHOTS_STORE).get(snapshotId);
  const stored = parseStoredWebSnapshotRecord(snapshot.webSnapshotEntry);
  if (!stored) return;
  snapshot.assetRefEntries = await Promise.all([
    getStore(tx, ASSET_REFS_STORE).get(stored.packageAssetId),
    getStore(tx, ASSET_REFS_STORE).get(stored.screenshotAssetId),
  ]);
  snapshot.assetOwnerEntries = await Promise.all([
    getStore(tx, ASSET_OWNERS_STORE).get([
      WEB_SNAPSHOT_OWNER_KIND,
      stored.id,
      WEB_SNAPSHOT_PACKAGE_ROLE,
    ]),
    getStore(tx, ASSET_OWNERS_STORE).get([
      WEB_SNAPSHOT_OWNER_KIND,
      stored.id,
      WEB_SNAPSHOT_SCREENSHOT_ROLE,
    ]),
  ]);
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
    imageWorkspaceEntry:
      entry.source.kind === 'screenshot'
        ? await getStore(tx, IMAGE_WORKSPACES_STORE).get(entry.id)
        : undefined,
    aggregatePresentationEntry:
      entry.source.kind === 'screenshot'
        ? await getStore(tx, AGGREGATE_PRESENTATIONS_STORE).get(['image', entry.id])
        : undefined,
    assetOwnerEntry: undefined,
    assetRefEntry: undefined,
    assetOwnerEntries: [],
    assetRefEntries: [],
  };

  if (entry.source.kind === 'recording') {
    snapshot.recordingEntry = await getStore(tx, STORE_NAME).get(entry.source.recordingId);
    const stored = parseRecordingEntry(snapshot.recordingEntry);
    if (stored) {
      snapshot.assetRefEntry = await getStore(tx, ASSET_REFS_STORE).get(stored.assetId);
      snapshot.assetOwnerEntry = await getStore(tx, ASSET_OWNERS_STORE).get([
        RECORDING_ASSET_OWNER_KIND,
        entry.source.recordingId,
        RECORDING_ASSET_ROLE,
      ]);
    }
    snapshot.recordingTelemetryEntry = await getStore(tx, RECORDING_TELEMETRY_STORE).get(
      entry.source.recordingId
    );
  } else if (entry.source.kind === 'project-export') {
    snapshot.projectExportEntry = await getStore(tx, PROJECT_EXPORTS_STORE).get(
      entry.source.exportId
    );
    const stored = parseProjectExportEntry(snapshot.projectExportEntry);
    if (stored) {
      snapshot.assetRefEntry = await getStore(tx, ASSET_REFS_STORE).get(stored.assetId);
      snapshot.assetOwnerEntry = await getStore(tx, ASSET_OWNERS_STORE).get([
        PROJECT_EXPORT_OWNER_KIND,
        entry.source.exportId,
        PROJECT_MEDIA_ASSET_ROLE,
      ]);
    }
  } else if (entry.source.kind === 'project-asset') {
    snapshot.projectAssetEntry = await getStore(tx, PROJECT_ASSETS_STORE).get(
      entry.source.projectAssetId
    );
    const stored = parseProjectAssetEntry(snapshot.projectAssetEntry);
    if (stored) {
      snapshot.assetRefEntry = await getStore(tx, ASSET_REFS_STORE).get(stored.assetId);
      snapshot.assetOwnerEntry = await getStore(tx, ASSET_OWNERS_STORE).get([
        PROJECT_ASSET_OWNER_KIND,
        entry.source.projectAssetId,
        PROJECT_MEDIA_ASSET_ROLE,
      ]);
    }
  } else if (entry.source.kind === 'web-snapshot') {
    await snapshotWebSnapshotOwnership(tx, entry.source.snapshotId, snapshot);
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
  await restoreSnapshotEntry(tx, ASSET_REFS_STORE, snapshot.assetRefEntry);
  await restoreSnapshotEntry(tx, ASSET_OWNERS_STORE, snapshot.assetOwnerEntry);
  for (const ref of snapshot.assetRefEntries) {
    await restoreSnapshotEntry(tx, ASSET_REFS_STORE, ref);
  }
  for (const owner of snapshot.assetOwnerEntries) {
    await restoreSnapshotEntry(tx, ASSET_OWNERS_STORE, owner);
  }
  await restoreSnapshotEntry(tx, RECORDING_TELEMETRY_STORE, snapshot.recordingTelemetryEntry);
  await restoreSnapshotEntry(tx, PROJECT_ASSETS_STORE, snapshot.projectAssetEntry);
  await restoreSnapshotEntry(tx, PROJECT_EXPORTS_STORE, snapshot.projectExportEntry);
  await restoreSnapshotEntry(tx, WEB_SNAPSHOTS_STORE, snapshot.webSnapshotEntry);
  await restoreSnapshotEntry(tx, MEDIA_LIBRARY_STORE, snapshot.mediaLibraryEntry);
  await restoreSnapshotEntry(tx, THUMBNAILS_STORE, snapshot.thumbnailEntry);
  await restoreSnapshotEntry(tx, IMAGE_WORKSPACES_STORE, snapshot.imageWorkspaceEntry);
  await restoreSnapshotEntry(
    tx,
    AGGREGATE_PRESENTATIONS_STORE,
    snapshot.aggregatePresentationEntry
  );
}

async function writeWebSnapshotAssetRecord(
  tx: BackupTransaction,
  entry: Omit<MediaLibraryEntry, 'blob'>,
  webSnapshotRecord: PreparedBackupWebSnapshotRecord | null,
  preparedAssetPublication?: PreparedRestoreRecordingAsset
): Promise<void> {
  const screenshotAsset = preparedAssetPublication?.additionalAssets?.[0];
  if (!webSnapshotRecord || !preparedAssetPublication || !screenshotAsset) {
    throw new Error('Web snapshot backup record is missing.');
  }
  const packageAsset = preparedAssetPublication.asset;
  const storedRecord = markWebSnapshotProvenanceSanitized({
    createdAt: webSnapshotRecord.createdAt,
    id: webSnapshotRecord.id,
    manifest: webSnapshotRecord.manifest,
    packageAssetId: packageAsset.ref.assetId,
    screenshotAssetId: screenshotAsset.ref.assetId,
    screenshotMimeType: screenshotAsset.ref.mimeType,
    screenshotSize: screenshotAsset.ref.size,
    size: packageAsset.ref.size,
    updatedAt: webSnapshotRecord.updatedAt,
  });
  for (const [asset, role] of [
    [packageAsset, WEB_SNAPSHOT_PACKAGE_ROLE],
    [screenshotAsset, WEB_SNAPSHOT_SCREENSHOT_ROLE],
  ] as const) {
    await getStore(tx, ASSET_REFS_STORE).put(asset.ref);
    await getStore(tx, ASSET_OWNERS_STORE).put({
      assetId: asset.ref.assetId,
      ownerId: storedRecord.id,
      ownerKind: WEB_SNAPSHOT_OWNER_KIND,
      role,
    });
  }
  await getStore(tx, WEB_SNAPSHOTS_STORE).put(storedRecord);
  await getStore(tx, MEDIA_LIBRARY_STORE).put(entry);
}

export async function writeMainAssetRecord(
  tx: BackupTransaction,
  entry: Omit<MediaLibraryEntry, 'blob'>,
  blob: Blob | null,
  recordingTelemetry: RecordingTelemetryEntry | null,
  webSnapshotRecord: PreparedBackupWebSnapshotRecord | null = null,
  preparedAssetPublication?: PreparedRestoreRecordingAsset
): Promise<void> {
  if (entry.source.kind === 'screenshot') {
    if (!blob) throw new Error('Screenshot backup blob is missing.');
    await getStore(tx, MEDIA_LIBRARY_STORE).put({ ...entry, blob } satisfies MediaLibraryEntry);
    return;
  }

  if (entry.source.kind === 'recording') {
    if (!preparedAssetPublication) throw new Error('Prepared recording asset is missing.');
    await getStore(tx, STORE_NAME).put(
      createRecordingStoreEntry(entry.source.recordingId, entry, preparedAssetPublication.asset)
    );
    await getStore(tx, ASSET_REFS_STORE).put(preparedAssetPublication.asset.ref);
    await getStore(tx, ASSET_OWNERS_STORE).put({
      assetId: preparedAssetPublication.asset.ref.assetId,
      ownerId: entry.source.recordingId,
      ownerKind: RECORDING_ASSET_OWNER_KIND,
      role: RECORDING_ASSET_ROLE,
    });
    if (recordingTelemetry) {
      await getStore(tx, RECORDING_TELEMETRY_STORE).put(recordingTelemetry);
    }
    await getStore(tx, MEDIA_LIBRARY_STORE).put(entry);
    return;
  }

  if (entry.source.kind === 'project-export') {
    if (!preparedAssetPublication) throw new Error('Prepared project export asset is missing.');
    await getStore(tx, ASSET_REFS_STORE).put(preparedAssetPublication.asset.ref);
    await getStore(tx, ASSET_OWNERS_STORE).put({
      assetId: preparedAssetPublication.asset.ref.assetId,
      ownerId: entry.source.exportId,
      ownerKind: PROJECT_EXPORT_OWNER_KIND,
      role: PROJECT_MEDIA_ASSET_ROLE,
    });
    await getStore(tx, PROJECT_EXPORTS_STORE).put(
      createProjectExportStoreEntry(entry, preparedAssetPublication.asset)
    );
    await getStore(tx, MEDIA_LIBRARY_STORE).put(entry);
    return;
  }

  if (entry.source.kind === 'web-snapshot') {
    await writeWebSnapshotAssetRecord(tx, entry, webSnapshotRecord, preparedAssetPublication);
    return;
  }

  assertSafeProjectAssetStorageMetadata(entry.size, entry.mimeType);
  if (!preparedAssetPublication) throw new Error('Prepared project asset is missing.');
  if (preparedAssetPublication.asset.ref.size !== entry.size) {
    throw new Error('Prepared project asset size does not match media metadata.');
  }
  await getStore(tx, ASSET_REFS_STORE).put(preparedAssetPublication.asset.ref);
  await getStore(tx, ASSET_OWNERS_STORE).put({
    assetId: preparedAssetPublication.asset.ref.assetId,
    ownerId: entry.source.projectAssetId,
    ownerKind: PROJECT_ASSET_OWNER_KIND,
    role: PROJECT_MEDIA_ASSET_ROLE,
  });
  await getStore(tx, PROJECT_ASSETS_STORE).put(
    createProjectAssetStoreEntry(entry, preparedAssetPublication.asset)
  );
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
  blob: Blob | null,
  thumbnail: Blob | null,
  recordingTelemetry: RecordingTelemetryEntry | null = null,
  webSnapshotRecord: PreparedBackupWebSnapshotRecord | null = null,
  workspace: ImageWorkspaceEntry | null = null,
  presentation: AggregatePresentationEntry | null = null,
  preparedAssetPublication?: PreparedRestoreRecordingAsset
): Promise<void> {
  await writeMainAssetRecord(
    tx,
    entry,
    blob,
    recordingTelemetry,
    webSnapshotRecord,
    preparedAssetPublication
  );
  await writeThumbnailRecord(tx, entry, thumbnail);
  // V4/V5 workspaces embed binary data URLs and are intentionally retired by schema V29.
  // V6 restore publishes file-backed EditorDocumentV3 rows through the asset transaction.
  void workspace;
  if (presentation) await getStore(tx, AGGREGATE_PRESENTATIONS_STORE).put(presentation);
}
