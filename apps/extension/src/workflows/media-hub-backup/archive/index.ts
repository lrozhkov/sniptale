import type { initDB } from '../../../composition/persistence/infrastructure/indexed-db/core';
import type {
  MediaLibraryEntry,
  MediaThumbnailEntry,
} from '../../../composition/persistence/media-library/contracts';
import type { ProjectAssetEntry } from '../../../composition/persistence/projects/contracts';
import type {
  RecordingTelemetryEntry,
  RecordingEntry,
} from '../../../composition/persistence/recordings/contracts';
import type { WebSnapshotRecord } from '../../../composition/persistence/web-snapshots/contracts';
import { translate } from '../../../platform/i18n';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import { sanitizeWebSnapshotPackageProvenance } from '../../../features/web-snapshot/provenance';
import {
  PROJECT_ASSETS_STORE,
  RECORDING_TELEMETRY_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  WEB_SNAPSHOTS_STORE,
} from '../storage/constants';
import {
  appendBackupBlobEntry,
  type BackupExportBudget,
  type BackupZipWriter,
} from '../export/blob/budget';
import { createMediaHubBackupExportOptions } from '../export/options';
import { applyMediaEntryPrivacyOptions } from '../export/privacy';
import type {
  MediaHubBackupAssetDescriptor,
  MediaHubBackupExportOptions,
} from '../contracts/types';

type BackupDatabase = Pick<Awaited<ReturnType<typeof initDB>>, 'get'>;

export async function appendBackupAssetDescriptor(args: {
  assets: MediaHubBackupAssetDescriptor[];
  budget: BackupExportBudget;
  db: BackupDatabase;
  encodePathSegment: (value: string) => string;
  entry: MediaLibraryEntry;
  options?: MediaHubBackupExportOptions;
  signal?: AbortSignal | undefined;
  thumbnailCount: number;
  zip: BackupZipWriter;
}): Promise<number> {
  const options = args.options ?? createMediaHubBackupExportOptions();
  const blob = await resolveBackupMediaBlob(args.db, args.entry, options);
  if (!blob) {
    throw new Error(
      `${translate('shared.mediaHub.backupBlobMissingPrefix')} ` +
        `${args.entry.filename} ` +
        translate('shared.mediaHub.backupBlobMissingSuffix')
    );
  }

  const assetPath = `assets/${args.encodePathSegment(args.entry.id)}`;
  appendBackupBlobEntry({
    blob,
    budget: args.budget,
    label: `asset ${args.entry.id}`,
    path: assetPath,
    signal: args.signal,
    zip: args.zip,
  });

  const thumbnailPath = await appendBackupThumbnailDescriptor(args);

  const sanitizedEntry = createBackupMediaEntry(args.entry, blob.size);
  const recordingTelemetry =
    options.includeTelemetry && args.entry.source.kind === 'recording'
      ? await resolveRecordingTelemetry(args.db, args.entry)
      : undefined;
  args.assets.push({
    assetPath,
    entry: buildBackupAssetEntry(sanitizedEntry, options),
    ...(recordingTelemetry === undefined ? {} : { recordingTelemetry }),
    thumbnailPath,
  });

  return args.thumbnailCount;
}

function buildBackupAssetEntry(
  entry: Omit<MediaLibraryEntry, 'blob'>,
  options: MediaHubBackupExportOptions
): Omit<MediaLibraryEntry, 'blob'> {
  return applyMediaEntryPrivacyOptions(entry, options);
}

function createBackupMediaEntry(
  entry: MediaLibraryEntry,
  archivedSize: number
): Omit<MediaLibraryEntry, 'blob'> {
  const { blob: _blob, ...entryWithoutBlob } = entry;
  return {
    ...entryWithoutBlob,
    size: archivedSize,
    sourceFavicon: sanitizeProvenanceUrl(entryWithoutBlob.sourceFavicon),
    sourceUrl: sanitizeProvenanceUrl(entryWithoutBlob.sourceUrl),
  };
}

async function appendBackupThumbnailDescriptor(args: {
  budget: BackupExportBudget;
  db: BackupDatabase;
  encodePathSegment: (value: string) => string;
  entry: MediaLibraryEntry;
  signal?: AbortSignal | undefined;
  thumbnailCount: number;
  zip: BackupZipWriter;
}): Promise<string | null> {
  const thumbnailEntry = (await args.db.get(THUMBNAILS_STORE, args.entry.id)) as
    | MediaThumbnailEntry
    | undefined;
  if (!thumbnailEntry) {
    return null;
  }

  const thumbnailPath = `thumbnails/${args.encodePathSegment(args.entry.id)}`;
  appendBackupBlobEntry({
    blob: thumbnailEntry.blob,
    budget: args.budget,
    label: `thumbnail ${args.entry.id}`,
    path: thumbnailPath,
    signal: args.signal,
    zip: args.zip,
  });
  args.thumbnailCount += 1;
  return thumbnailPath;
}

async function resolveRecordingTelemetry(
  db: BackupDatabase,
  entry: MediaLibraryEntry
): Promise<RecordingTelemetryEntry | undefined> {
  if (entry.source.kind !== 'recording') {
    return undefined;
  }

  return (await db.get(RECORDING_TELEMETRY_STORE, entry.source.recordingId)) as
    | RecordingTelemetryEntry
    | undefined;
}

export async function resolveBackupMediaBlob(
  db: BackupDatabase,
  entry: MediaLibraryEntry,
  rawOptions: Partial<MediaHubBackupExportOptions> = {}
): Promise<Blob | null> {
  const options = createMediaHubBackupExportOptions(rawOptions);

  if (entry.source.kind === 'screenshot') {
    return entry.blob ?? null;
  }

  if (entry.source.kind === 'recording' || entry.source.kind === 'project-export') {
    const recording = (await db.get(STORE_NAME, entry.source.recordingId)) as
      | RecordingEntry
      | undefined;
    return recording?.blob ?? null;
  }

  if (entry.source.kind === 'web-snapshot') {
    const snapshot = (await db.get(WEB_SNAPSHOTS_STORE, entry.source.snapshotId)) as
      | WebSnapshotRecord
      | undefined;
    return snapshot ? createSanitizedWebSnapshotPackageBlob(snapshot, options) : null;
  }

  const projectAsset = (await db.get(PROJECT_ASSETS_STORE, entry.source.projectAssetId)) as
    | ProjectAssetEntry
    | undefined;
  return projectAsset?.blob ?? null;
}

async function createSanitizedWebSnapshotPackageBlob(
  snapshot: WebSnapshotRecord,
  options: MediaHubBackupExportOptions
): Promise<Blob> {
  const sanitizedPackage = await sanitizeWebSnapshotPackageProvenance(
    snapshot.packageBlob,
    snapshot.manifest,
    { includeSourceMetadata: options.includeSourceMetadata }
  );
  return sanitizedPackage.packageBlob;
}
