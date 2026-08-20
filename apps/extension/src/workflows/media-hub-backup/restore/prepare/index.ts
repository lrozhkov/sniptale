import { getMediaLibraryEntry } from '../../../../composition/persistence/media-library/index';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import type { WebSnapshotRecord } from '../../../../composition/persistence/web-snapshots/contracts';
import { translate } from '../../../../platform/i18n';
import {
  type MediaHubBackupMetadata,
  type MediaHubImportConflictStrategy,
} from '../../contracts/types';
import { createBackupWebSnapshotRecord } from '../web-snapshot';
import { MAX_BACKUP_ENTRY_BYTES } from '../../manifest';
import type { ImageWorkspaceEntry } from '../../../../composition/persistence/image-workspaces/contracts';
import type { AggregatePresentationEntry } from '../../../../composition/persistence/aggregate-presentations/contracts';
import { materializeAggregatePresentation } from '../presentation';
import type { BackupArchiveReader } from '../archive-reader';
import {
  createAssetPublicationJournal,
  discardPreparedAsset,
  type PreparedAssetObject,
} from '../../../../composition/persistence/assets';
import { RECORDING_ASSET_PUBLICATION_DOMAIN } from '../../../../composition/persistence/recordings/asset-publication';
import {
  PROJECT_ASSET_PUBLICATION_DOMAIN,
  PROJECT_EXPORT_PUBLICATION_DOMAIN,
} from '../../../../composition/persistence/projects/asset-publication';
import { writeBackupArchiveEntryToAsset } from '../asset-stream';

export interface PreparedRestoreRecordingAsset {
  asset: PreparedAssetObject;
  journalId: string;
}

export interface PreparedBackupImportAsset {
  assetPath: string | null;
  assetBlob: Blob | null;
  existingEntry: MediaLibraryEntry | undefined;
  nextEntry: Omit<MediaLibraryEntry, 'blob'>;
  recordingTelemetry: RecordingTelemetryEntry | null;
  thumbnailPath: string | null;
  thumbnailBlob: Blob | null;
  webSnapshotRecord: WebSnapshotRecord | null;
  workspace?: ImageWorkspaceEntry | null;
  presentation?: AggregatePresentationEntry | null;
  preparedAssetPublication?: PreparedRestoreRecordingAsset;
}

export interface BackupImportAssetPlan {
  assetPath: string | null;
  existingEntry: MediaLibraryEntry | undefined;
  nextEntry: Omit<MediaLibraryEntry, 'blob'>;
  recordingTelemetry: RecordingTelemetryEntry | null;
  thumbnailPath: string | null;
  webSnapshotPackage: {
    createdAt: number;
    snapshotId: string;
    updatedAt: number;
  } | null;
  workspace: ImageWorkspaceEntry | null;
  presentationDescriptor: MediaHubBackupMetadata['assets'][number]['presentation'];
}

export type { BackupArchiveReader } from '../archive-reader';

function remapRecordingTelemetry(
  entry: Omit<MediaLibraryEntry, 'blob'>,
  telemetry: RecordingTelemetryEntry | undefined
): RecordingTelemetryEntry | null {
  if (!telemetry || entry.source.kind !== 'recording') {
    return null;
  }

  return {
    ...telemetry,
    recordingId: entry.source.recordingId,
  };
}

function createWebSnapshotPackagePlan(entry: Omit<MediaLibraryEntry, 'blob'>): {
  createdAt: number;
  snapshotId: string;
  updatedAt: number;
} | null {
  if (entry.source.kind !== 'web-snapshot') {
    return null;
  }

  return {
    createdAt: entry.createdAt,
    snapshotId: entry.source.snapshotId,
    updatedAt: entry.updatedAt,
  };
}

export async function loadRequiredArchiveBlob(args: {
  assetPath: string | null;
  filename: string;
  zip: BackupArchiveReader;
}): Promise<Blob> {
  const assetBlob = args.assetPath ? await args.zip.file(args.assetPath)?.async('blob') : null;
  if (assetBlob) {
    assertBackupBlobSize(assetBlob, args.filename);
    return assetBlob;
  }

  throw new Error(`${translate('shared.mediaHub.backupAssetBlobMissingPrefix')} ${args.filename}.`);
}

function assertBackupBlobSize(blob: Blob, filename: string): void {
  if (blob.size > MAX_BACKUP_ENTRY_BYTES) {
    throw new Error(`${translate('shared.mediaHub.backupReadFailedPrefix')} ${filename}.`);
  }
}

export async function prepareBackupImportAsset(args: {
  asset: MediaHubBackupMetadata['assets'][number];
  remapEntryForDuplicate: (
    entry: Omit<MediaLibraryEntry, 'blob'>
  ) => Omit<MediaLibraryEntry, 'blob'>;
  strategy: MediaHubImportConflictStrategy;
  zip: BackupArchiveReader;
}): Promise<{ prepared: BackupImportAssetPlan | null; resolvedConflict: boolean }> {
  let nextEntry = args.asset.entry;
  const existingEntry = await getMediaLibraryEntry(nextEntry.id);

  if (existingEntry && args.strategy === 'skip') {
    return { prepared: null, resolvedConflict: false };
  }

  if (existingEntry && args.strategy === 'duplicate') {
    nextEntry = args.remapEntryForDuplicate(nextEntry);
  }

  return {
    prepared: {
      assetPath: args.asset.assetPath,
      existingEntry,
      nextEntry,
      recordingTelemetry: remapRecordingTelemetry(nextEntry, args.asset.recordingTelemetry),
      thumbnailPath: args.asset.thumbnailPath ?? null,
      webSnapshotPackage: createWebSnapshotPackagePlan(nextEntry),
      workspace:
        args.asset.workspace?.aggregateId === args.asset.entry.id
          ? { ...args.asset.workspace, aggregateId: nextEntry.id }
          : null,
      presentationDescriptor:
        args.asset.presentation?.entry.aggregateId === args.asset.entry.id
          ? {
              ...args.asset.presentation,
              entry: { ...args.asset.presentation.entry, aggregateId: nextEntry.id },
            }
          : undefined,
    },
    resolvedConflict: existingEntry !== undefined,
  };
}

export function assertBackupImportAssetEntriesAvailable(
  preparedAssets: BackupImportAssetPlan[],
  zip: BackupArchiveReader
): void {
  for (const prepared of preparedAssets) {
    if (!prepared.assetPath || !zip.file(prepared.assetPath)) {
      throw new Error(
        `${translate('shared.mediaHub.backupAssetBlobMissingPrefix')} ${prepared.nextEntry.filename}.`
      );
    }

    if (prepared.thumbnailPath && !zip.file(prepared.thumbnailPath)) {
      throw new Error(
        `${translate('shared.mediaHub.backupAssetBlobMissingPrefix')} ${prepared.thumbnailPath}.`
      );
    }
  }
}

async function loadThumbnailBlob(args: {
  path: string | null;
  zip: BackupArchiveReader;
}): Promise<Blob | null> {
  if (!args.path) {
    return null;
  }

  const thumbnailBlob = (await args.zip.file(args.path)?.async('blob')) ?? null;
  if (thumbnailBlob) {
    assertBackupBlobSize(thumbnailBlob, args.path);
  }
  return thumbnailBlob;
}

async function createWebSnapshotRecordFromPlan(
  prepared: BackupImportAssetPlan,
  assetBlob: Blob
): Promise<WebSnapshotRecord | null> {
  if (!prepared.webSnapshotPackage) {
    return null;
  }

  return createBackupWebSnapshotRecord({
    ...prepared.webSnapshotPackage,
    packageBlob: assetBlob,
  });
}

export async function loadBackupImportAssetBatch(args: {
  operationId?: string;
  preparedAssets: BackupImportAssetPlan[];
  zip: BackupArchiveReader;
}): Promise<PreparedBackupImportAsset[]> {
  return Promise.all(args.preparedAssets.map((prepared) => loadBackupImportAsset(prepared, args)));
}

async function loadBackupImportAsset(
  prepared: BackupImportAssetPlan,
  args: { operationId?: string; zip: BackupArchiveReader }
): Promise<PreparedBackupImportAsset> {
  const preparedAssetPublication = await stageDurableBackupAsset(prepared, args);
  const assetBlob = preparedAssetPublication
    ? null
    : await loadRequiredArchiveBlob({
        assetPath: prepared.assetPath,
        filename: prepared.nextEntry.filename,
        zip: args.zip,
      });
  const thumbnailBlob = await loadThumbnailBlob({ path: prepared.thumbnailPath, zip: args.zip });
  const webSnapshotRecord = assetBlob
    ? await createWebSnapshotRecordFromPlan(prepared, assetBlob)
    : null;
  const presentation = await materializeAggregatePresentation({
    descriptor: prepared.presentationDescriptor,
    ref: { id: prepared.nextEntry.id, kind: 'image' },
    zip: args.zip,
  });
  return {
    ...prepared,
    assetBlob,
    nextEntry: webSnapshotRecord
      ? { ...prepared.nextEntry, size: webSnapshotRecord.size }
      : prepared.nextEntry,
    thumbnailBlob,
    webSnapshotRecord,
    presentation,
    ...(preparedAssetPublication ? { preparedAssetPublication } : {}),
  };
}

async function stageDurableBackupAsset(
  prepared: BackupImportAssetPlan,
  args: { operationId?: string; zip: BackupArchiveReader }
): Promise<PreparedRestoreRecordingAsset | undefined> {
  const source = prepared.nextEntry.source;
  if (
    source.kind !== 'recording' &&
    source.kind !== 'project-export' &&
    source.kind !== 'project-asset'
  ) {
    return undefined;
  }
  if (!args.operationId) throw new Error('Restore operation ID is missing.');
  if (!prepared.assetPath) throw new Error('Durable restore asset path is missing.');
  const asset = await writeBackupArchiveEntryToAsset({
    expectedSize: prepared.nextEntry.size,
    mimeType: prepared.nextEntry.mimeType,
    path: prepared.assetPath,
    zip: args.zip,
  });
  const domain =
    source.kind === 'recording'
      ? RECORDING_ASSET_PUBLICATION_DOMAIN
      : source.kind === 'project-export'
        ? PROJECT_EXPORT_PUBLICATION_DOMAIN
        : PROJECT_ASSET_PUBLICATION_DOMAIN;
  const payload =
    source.kind === 'recording'
      ? { recordingId: source.recordingId, restore: true }
      : source.kind === 'project-export'
        ? { projectExportId: source.exportId, restore: true }
        : { projectAssetId: source.projectAssetId, restore: true };
  const journal = await createAssetPublicationJournal({
    assetRefs: [asset.ref],
    domain,
    operationId: args.operationId,
    payload,
  }).catch((error: unknown) => discardStagedBackupAsset(asset.ref.assetId, error));
  return { asset, journalId: journal.journalId };
}

async function discardStagedBackupAsset(assetId: string, error: unknown): Promise<never> {
  let cleanupError: unknown;
  try {
    await discardPreparedAsset(assetId);
  } catch (caughtError) {
    cleanupError = caughtError;
  }
  if (cleanupError !== undefined) {
    throw new AggregateError(
      [error, cleanupError],
      'Recording restore staging failed before its ready journal became durable.',
      { cause: error }
    );
  }
  throw error;
}
