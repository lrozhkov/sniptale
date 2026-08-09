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

export interface PreparedBackupImportAsset {
  assetPath: string | null;
  assetBlob: Blob;
  existingEntry: MediaLibraryEntry | undefined;
  nextEntry: Omit<MediaLibraryEntry, 'blob'>;
  recordingTelemetry: RecordingTelemetryEntry | null;
  thumbnailPath: string | null;
  thumbnailBlob: Blob | null;
  webSnapshotRecord: WebSnapshotRecord | null;
  workspace?: ImageWorkspaceEntry | null;
  presentation?: AggregatePresentationEntry | null;
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
  preparedAssets: BackupImportAssetPlan[];
  zip: BackupArchiveReader;
}): Promise<PreparedBackupImportAsset[]> {
  return Promise.all(
    args.preparedAssets.map(async (prepared) => {
      const assetBlob = await loadRequiredArchiveBlob({
        assetPath: prepared.assetPath,
        filename: prepared.nextEntry.filename,
        zip: args.zip,
      });
      const thumbnailBlob = await loadThumbnailBlob({
        path: prepared.thumbnailPath,
        zip: args.zip,
      });
      const webSnapshotRecord = await createWebSnapshotRecordFromPlan(prepared, assetBlob);
      const presentation = await materializeAggregatePresentation({
        descriptor: prepared.presentationDescriptor,
        ref: { id: prepared.nextEntry.id, kind: 'image' },
        zip: args.zip,
      });
      const nextEntry = webSnapshotRecord
        ? { ...prepared.nextEntry, size: webSnapshotRecord.size }
        : prepared.nextEntry;

      return {
        ...prepared,
        assetBlob,
        nextEntry,
        thumbnailBlob,
        webSnapshotRecord,
        presentation,
      };
    })
  );
}
