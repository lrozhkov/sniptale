import type { initDB } from '../../../composition/persistence/infrastructure/indexed-db/core';
import type {
  MediaLibraryEntry,
  MediaThumbnailEntry,
} from '../../../composition/persistence/media-library/contracts';
import {
  parseProjectAssetEntry,
  parseProjectExportEntry,
} from '../../../composition/persistence/projects/read-guards';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { parseRecordingEntry } from '../../../composition/persistence/recordings/index.guards';
import { parseAssetRef, readAssetFile } from '../../../composition/persistence/assets';
import { parseStoredWebSnapshotRecord } from '../../../composition/persistence/web-snapshots';
import type { ImageWorkspaceEntry } from '../../../composition/persistence/image-workspaces/contracts';
import { recoverAndGetStoredImageWorkspace } from '../../../composition/persistence/image-workspaces';
import { materializePersistedEditorDocumentForLegacyTransfer } from '../../../composition/persistence/document-assets';
import { translate } from '../../../platform/i18n';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import { sanitizeWebSnapshotPackageProvenance } from '../../../features/web-snapshot/provenance';
import {
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  ASSET_REFS_STORE,
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
import {
  applyMediaEntryPrivacyOptions,
  applyScenarioStepDocumentPrivacyOptions,
} from '../export/privacy';
import type {
  MediaHubBackupAssetDescriptor,
  MediaHubBackupExportOptions,
} from '../contracts/types';
import { appendAggregatePresentation } from '../export/presentation';

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

  const isImageAggregate =
    args.entry.source.kind === 'screenshot' &&
    (args.entry.kind === 'screenshot' || args.entry.kind === 'image');
  const thumbnailPath = isImageAggregate ? null : await appendBackupThumbnailDescriptor(args);

  const sanitizedEntry = createBackupMediaEntry(args.entry, blob.size);
  const recordingTelemetry =
    options.includeTelemetry && args.entry.source.kind === 'recording'
      ? await resolveRecordingTelemetry(args.db, args.entry)
      : undefined;
  const storedWorkspace = isImageAggregate
    ? await recoverAndGetStoredImageWorkspace(args.entry.id)
    : undefined;
  const workspace = storedWorkspace
    ? {
        ...storedWorkspace,
        document: await materializePersistedEditorDocumentForLegacyTransfer({
          document: storedWorkspace.document,
          refs: await Promise.all(
            storedWorkspace.document.assets.map((asset) =>
              args.db.get(ASSET_REFS_STORE, asset.assetId)
            )
          ),
        }),
      }
    : undefined;
  const presentation = isImageAggregate
    ? await appendAggregatePresentation({
        aggregateId: args.entry.id,
        aggregateKind: 'image',
        budget: args.budget,
        db: args.db,
        pathPrefix: `aggregate-presentations/image/${args.encodePathSegment(args.entry.id)}`,
        signal: args.signal,
        zip: args.zip,
      })
    : undefined;
  args.assets.push({
    assetPath,
    entry: buildBackupAssetEntry(sanitizedEntry, options),
    ...(recordingTelemetry === undefined ? {} : { recordingTelemetry }),
    thumbnailPath,
    ...(workspace ? { workspace: sanitizeWorkspace(workspace, options) } : {}),
    ...(presentation ? { presentation } : {}),
  });

  return args.thumbnailCount + (presentation ? 1 : 0);
}

function sanitizeWorkspace(
  workspace: ImageWorkspaceEntry,
  options: MediaHubBackupExportOptions
): ImageWorkspaceEntry {
  const sanitizedWorkspace = options.includeSourceMetadata
    ? { ...workspace, sourceUrl: sanitizeProvenanceUrl(workspace.sourceUrl) }
    : { ...workspace, sourceTitle: null, sourceUrl: null };
  return applyScenarioStepDocumentPrivacyOptions(sanitizedWorkspace, options);
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

  if (entry.source.kind === 'recording') {
    const recording = parseRecordingEntry(await db.get(STORE_NAME, entry.source.recordingId));
    if (!recording) return null;
    const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, recording.assetId));
    return ref ? readAssetFile(ref, recording.filename) : null;
  }

  if (entry.source.kind === 'project-export') {
    const projectExport = parseProjectExportEntry(
      await db.get(PROJECT_EXPORTS_STORE, entry.source.exportId)
    );
    if (!projectExport) return null;
    const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, projectExport.assetId));
    return ref ? readAssetFile(ref, projectExport.filename) : null;
  }

  if (entry.source.kind === 'web-snapshot') {
    const snapshot = parseStoredWebSnapshotRecord(
      await db.get(WEB_SNAPSHOTS_STORE, entry.source.snapshotId)
    );
    return snapshot ? createSanitizedWebSnapshotPackageBlob(db, snapshot, options) : null;
  }

  const projectAsset = parseProjectAssetEntry(
    await db.get(PROJECT_ASSETS_STORE, entry.source.projectAssetId)
  );
  if (!projectAsset) return null;
  const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, projectAsset.assetId));
  return ref ? readAssetFile(ref, projectAsset.id) : null;
}

async function createSanitizedWebSnapshotPackageBlob(
  db: BackupDatabase,
  snapshot: NonNullable<ReturnType<typeof parseStoredWebSnapshotRecord>>,
  options: MediaHubBackupExportOptions
): Promise<Blob> {
  const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, snapshot.packageAssetId));
  if (!ref) throw new Error(`Web snapshot package ref is missing: ${snapshot.id}.`);
  const packageFile = await readAssetFile(ref, `${snapshot.id}.sniptale-web-snapshot.zip`);
  const sanitizedPackage = await sanitizeWebSnapshotPackageProvenance(
    packageFile,
    snapshot.manifest,
    { includeSourceMetadata: options.includeSourceMetadata }
  );
  return sanitizedPackage.packageBlob;
}
