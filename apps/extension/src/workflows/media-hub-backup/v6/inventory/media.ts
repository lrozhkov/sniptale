import type { ArchivePathAllocator } from '../../../../composition/archive-transfer';
import { parseAssetRef, readAssetFile } from '../../../../composition/persistence/assets';
import { parseAggregatePresentationEntry } from '../../../../composition/persistence/aggregate-presentations/parser';
import { createAggregatePresentationKey } from '../../../../composition/persistence/aggregate-presentations/contracts';
import { parseImageWorkspaceEntry } from '../../../../composition/persistence/image-workspaces/parser';
import type {
  MediaLibraryEntry,
  MediaLibraryItem,
  MediaThumbnailEntry,
} from '../../../../composition/persistence/media-library/contracts';
import { parseMediaLibraryEntry } from '../../../../composition/persistence/media-library/read-guards';
import { parseRecordingEntry } from '../../../../composition/persistence/recordings/index.guards';
import { parseRecordingTelemetryEntry } from '../../../../composition/persistence/recordings/telemetry.guards';
import { parseStoredWebSnapshotRecord } from '../../../../composition/persistence/web-snapshots';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_REFS_STORE,
  IMAGE_WORKSPACES_STORE,
  MEDIA_LIBRARY_STORE,
  RECORDING_TELEMETRY_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  WEB_SNAPSHOTS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { sanitizeWebSnapshotPackageProvenance } from '../../../../features/web-snapshot/provenance';
import { encodePortableEditorDocument } from '../root-codecs/editor-document';
import {
  encodePortablePresentation,
  encodePortableThumbnail,
  type PortableMediaMetadata,
} from '../root-codecs/media';
import {
  projectImageWorkspacePrivacy,
  projectMediaEntryPrivacy,
  projectRecordingGroupMemberPrivacy,
} from '../privacy';
import type { JsonValue, MediaHubBackupExportOptions } from '../contracts';
import type { ArchiveRootObjectSource, MediaHubBackupRootInventoryItem } from '../export';
import { METADATA_ROOT, withDraftRoot } from '../layout';
import { PAGE_PACKAGE_ARCHIVE_MIME_TYPE } from '@sniptale/runtime-contracts/page-package';

interface MediaInventoryDatabase {
  get(store: string, key: unknown): Promise<unknown>;
}

function isThumbnail(value: unknown): value is MediaThumbnailEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'assetId' in value &&
    typeof value.assetId === 'string' &&
    'blob' in value &&
    value.blob instanceof Blob &&
    'createdAt' in value &&
    typeof value.createdAt === 'number' &&
    'updatedAt' in value &&
    typeof value.updatedAt === 'number' &&
    'width' in value &&
    typeof value.width === 'number' &&
    'height' in value &&
    typeof value.height === 'number'
  );
}

async function readRefFile(
  db: MediaInventoryDatabase,
  assetId: string,
  filename: string
): Promise<File> {
  const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, assetId));
  if (!ref) throw new Error(`Media backup asset reference is missing: ${assetId}.`);
  return readAssetFile(ref, filename);
}

function selected(item: MediaLibraryItem, options: MediaHubBackupExportOptions): boolean {
  if (item.source.kind === 'project-asset' || item.source.kind === 'project-export') return false;
  if (item.source.kind === 'web-snapshot' && !options.includeWebSnapshots) return false;
  const explicitlySelected = Boolean(options.selected?.mediaAssetIds.includes(item.id));
  if (item.lifecycle?.storageClass === 'temporary' && !options.includeDrafts) return false;
  return options.scope === 'all' || explicitlySelected;
}

function withoutExtension(filename: string): string {
  const index = filename.lastIndexOf('.');
  return index > 0 ? filename.slice(0, index) : filename;
}

function imageExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/gif') return '.gif';
  return mimeType === 'image/png' ? '.png' : '';
}

function mediaObjectDirectory(
  entry: MediaLibraryEntry,
  options: MediaHubBackupExportOptions
): string[] {
  const isDraft = entry.lifecycle?.storageClass === 'temporary';
  if (entry.source.kind === 'web-snapshot') {
    return withDraftRoot(isDraft, [
      'Web snapshots',
      options.includeSourceMetadata
        ? entry.sourceTitle || withoutExtension(entry.filename)
        : 'Snapshot',
    ]);
  }
  if (entry.mimeType.startsWith('audio/')) return withDraftRoot(isDraft, ['Audio']);
  if (entry.source.kind === 'recording' || entry.mimeType.startsWith('video/')) {
    return withDraftRoot(isDraft, ['Recordings']);
  }
  return withDraftRoot(isDraft, ['Screenshots']);
}

interface MediaObjectCollector {
  add(blob: Blob, filename: string, mimeType?: string, directory?: readonly string[]): string;
  objects: ArchiveRootObjectSource[];
  sizeOf(objectId: string): number;
}

function createMediaObjectCollector(
  rootIndex: number,
  paths: ArchivePathAllocator
): MediaObjectCollector {
  const objects: ArchiveRootObjectSource[] = [];
  let sequence = 0;
  return {
    add(blob, filename, mimeType = blob.type || 'application/octet-stream', directory) {
      const rootNumber = String(rootIndex + 1).padStart(6, '0');
      const objectNumber = String(++sequence).padStart(6, '0');
      const objectId = `media-${rootNumber}-object-${objectNumber}`;
      const safeFilename = filename || `object-${sequence}`;
      objects.push({
        blob,
        ref: {
          filename: safeFilename,
          mimeType,
          objectId,
          path: paths.reserve(
            directory
              ? [...directory, safeFilename]
              : ['_sniptale', 'assets', objectId, safeFilename]
          ),
          size: blob.size,
        },
      });
      return objectId;
    },
    objects,
    sizeOf(objectId) {
      const object = objects.find((candidate) => candidate.ref.objectId === objectId);
      if (!object) throw new Error(`Media backup object is missing from inventory: ${objectId}.`);
      return object.ref.size;
    },
  };
}

async function buildRecordingSource(args: {
  collector: MediaObjectCollector;
  db: MediaInventoryDatabase;
  entry: MediaLibraryEntry;
  options: MediaHubBackupExportOptions;
  recordingId: string;
}) {
  const stored = parseRecordingEntry(await args.db.get(STORE_NAME, args.recordingId));
  if (!stored) {
    throw new Error(`Recording backup metadata is missing: ${args.recordingId}.`);
  }
  const file = await readRefFile(args.db, stored.assetId, stored.filename);
  const originalObjectId = args.collector.add(
    file,
    stored.filename,
    stored.mimeType,
    mediaObjectDirectory(args.entry, args.options)
  );
  const { assetId: _assetId, ...portableRecordingBase } = stored;
  const portableRecording = {
    ...portableRecordingBase,
    ...(stored.recordingGroup
      ? {
          recordingGroup: projectRecordingGroupMemberPrivacy(stored.recordingGroup, args.options),
        }
      : {}),
  };
  const telemetry = args.options.includeTelemetry
    ? parseRecordingTelemetryEntry(await args.db.get(RECORDING_TELEMETRY_STORE, stored.id))
    : null;
  return {
    originalObjectId,
    recording: {
      entry: portableRecording,
      ...(telemetry ? { telemetry } : {}),
    } satisfies NonNullable<PortableMediaMetadata['recording']>,
  };
}

async function buildWebSnapshotSource(args: {
  collector: MediaObjectCollector;
  db: MediaInventoryDatabase;
  entry: MediaLibraryEntry;
  options: MediaHubBackupExportOptions;
  snapshotId: string;
}) {
  const stored = parseStoredWebSnapshotRecord(
    await args.db.get(WEB_SNAPSHOTS_STORE, args.snapshotId)
  );
  if (!stored) {
    throw new Error(`Web snapshot backup metadata is missing: ${args.snapshotId}.`);
  }
  const [packageFile, screenshotFile] = await Promise.all([
    readRefFile(args.db, stored.packageAssetId, `${stored.id}.sniptale-page-package.zip`),
    readRefFile(args.db, stored.screenshotAssetId, `${stored.id}-screenshot`),
  ]);
  const sanitized = await sanitizeWebSnapshotPackageProvenance(packageFile, stored.manifest, {
    includeSourceMetadata: args.options.includeSourceMetadata,
  });
  const packageObjectId = args.collector.add(
    sanitized.packageBlob,
    `${stored.id}.sniptale-page-package.zip`,
    PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
    mediaObjectDirectory(args.entry, args.options)
  );
  const screenshotObjectId = args.collector.add(
    screenshotFile,
    args.options.includeSourceMetadata
      ? `${args.entry.sourceTitle || 'screenshot'}${imageExtension(stored.screenshotMimeType)}`
      : `screenshot${imageExtension(stored.screenshotMimeType)}`,
    stored.screenshotMimeType,
    mediaObjectDirectory(args.entry, args.options)
  );
  const { packageAssetId: _package, screenshotAssetId: _screenshot, ...portable } = stored;
  return {
    originalObjectId: packageObjectId,
    webSnapshot: {
      entry: {
        ...portable,
        manifest: sanitized.manifest,
        size: sanitized.packageBlob.size,
      },
      packageObjectId,
      screenshotObjectId,
    } satisfies NonNullable<PortableMediaMetadata['webSnapshot']>,
  };
}

async function buildMediaSource(args: {
  collector: MediaObjectCollector;
  db: MediaInventoryDatabase;
  entry: MediaLibraryEntry;
  options: MediaHubBackupExportOptions;
}): Promise<
  Partial<Pick<PortableMediaMetadata, 'recording' | 'webSnapshot'>> & {
    originalObjectId: string;
  }
> {
  const entry = args.entry;
  if (entry.source.kind === 'screenshot') {
    if (!entry.blob) throw new Error(`Screenshot backup bytes are missing: ${entry.id}.`);
    return {
      originalObjectId: args.collector.add(
        entry.blob,
        entry.filename,
        entry.mimeType,
        mediaObjectDirectory(entry, args.options)
      ),
    };
  }
  if (entry.source.kind === 'recording') {
    return buildRecordingSource({ ...args, entry, recordingId: entry.source.recordingId });
  }
  if (entry.source.kind === 'web-snapshot') {
    return buildWebSnapshotSource({ ...args, entry, snapshotId: entry.source.snapshotId });
  }
  throw new Error('Project-owned media mirror escaped the project root inventory.');
}

async function buildThumbnail(args: {
  collector: MediaObjectCollector;
  db: MediaInventoryDatabase;
  entry: MediaLibraryEntry;
  isImageAggregate: boolean;
}) {
  if (args.isImageAggregate) return undefined;
  const value = await args.db.get(THUMBNAILS_STORE, args.entry.id);
  if (!isThumbnail(value)) return undefined;
  return encodePortableThumbnail(
    value,
    args.collector.add(value.blob, `${args.entry.id}-thumbnail`, value.blob.type || 'image/png')
  );
}

async function buildWorkspace(args: {
  collector: MediaObjectCollector;
  db: MediaInventoryDatabase;
  entry: MediaLibraryEntry;
  isImageAggregate: boolean;
  options: MediaHubBackupExportOptions;
}): Promise<PortableMediaMetadata['workspace']> {
  if (!args.isImageAggregate) return undefined;
  const stored = parseImageWorkspaceEntry(await args.db.get(IMAGE_WORKSPACES_STORE, args.entry.id));
  if (!stored) return undefined;
  const privateWorkspace = projectImageWorkspacePrivacy(stored, args.options);
  const objectsByAssetId = new Map<string, string>();
  for (const asset of privateWorkspace.document.assets) {
    if (objectsByAssetId.has(asset.assetId)) continue;
    const file = await readRefFile(args.db, asset.assetId, `${args.entry.id}-${asset.role}`);
    objectsByAssetId.set(
      asset.assetId,
      args.collector.add(file, `${args.entry.id}-${asset.role}`, file.type || 'image/png')
    );
  }
  const { document, ...workspaceMetadata } = privateWorkspace;
  return {
    ...workspaceMetadata,
    document: encodePortableEditorDocument({ document, objectsByAssetId }),
  };
}

async function buildPresentation(args: {
  collector: MediaObjectCollector;
  db: MediaInventoryDatabase;
  entry: MediaLibraryEntry;
  isImageAggregate: boolean;
}) {
  if (!args.isImageAggregate) return undefined;
  const presentation = parseAggregatePresentationEntry(
    await args.db.get(
      AGGREGATE_PRESENTATIONS_STORE,
      createAggregatePresentationKey({ id: args.entry.id, kind: 'image' })
    )
  );
  if (!presentation) return undefined;
  return encodePortablePresentation({
    entry: presentation,
    ...(presentation.previewBlob
      ? {
          previewObjectId: args.collector.add(
            presentation.previewBlob,
            `${args.entry.id}-preview`,
            presentation.previewBlob.type || 'image/png'
          ),
        }
      : {}),
    thumbnailObjectId: args.collector.add(
      presentation.thumbnailBlob,
      `${args.entry.id}-presentation-thumbnail`,
      presentation.thumbnailBlob.type || 'image/png'
    ),
  });
}

function buildRootSummary(args: {
  entry: MediaLibraryEntry;
  options: MediaHubBackupExportOptions;
  presentation: PortableMediaMetadata['presentation'];
  source: Partial<Pick<PortableMediaMetadata, 'recording' | 'webSnapshot'>>;
  thumbnail: PortableMediaMetadata['thumbnail'];
}) {
  return {
    draftCount: args.entry.lifecycle?.storageClass === 'temporary' ? 1 : 0,
    recordingCount: args.source.recording ? 1 : 0,
    sourceMetadataCount:
      args.options.includeSourceMetadata &&
      Boolean(args.entry.sourceFavicon || args.entry.sourceTitle || args.entry.sourceUrl)
        ? 1
        : 0,
    telemetryCount: args.source.recording?.telemetry ? 1 : 0,
    thumbnailCount:
      (args.thumbnail ? 1 : 0) +
      (args.presentation ? 1 + (args.presentation.previewObjectId ? 1 : 0) : 0),
    webSnapshotCount: args.source.webSnapshot ? 1 : 0,
  };
}

async function buildMediaRoot(args: {
  db: MediaInventoryDatabase;
  item: MediaLibraryItem;
  options: MediaHubBackupExportOptions;
  paths: ArchivePathAllocator;
  rootIndex: number;
}): Promise<MediaHubBackupRootInventoryItem> {
  const entry = parseMediaLibraryEntry(await args.db.get(MEDIA_LIBRARY_STORE, args.item.id));
  if (!entry) throw new Error(`Media backup row is invalid: ${args.item.id}.`);
  const collector = createMediaObjectCollector(args.rootIndex, args.paths);
  const source = await buildMediaSource({ collector, db: args.db, entry, options: args.options });
  const isImageAggregate =
    entry.source.kind === 'screenshot' && (entry.kind === 'image' || entry.kind === 'screenshot');
  const thumbnail = await buildThumbnail({ collector, db: args.db, entry, isImageAggregate });
  const workspace = await buildWorkspace({
    collector,
    db: args.db,
    entry,
    isImageAggregate,
    options: args.options,
  });
  const presentation = await buildPresentation({
    collector,
    db: args.db,
    entry,
    isImageAggregate,
  });
  const { blob: _blob, ...entryWithoutBlob } = entry;
  const portableEntry =
    entry.source.kind === 'web-snapshot' && !args.options.includeSourceMetadata
      ? {
          ...entryWithoutBlob,
          filename: 'snapshot.sniptale-page-package.zip',
          originalFilename: 'snapshot.sniptale-page-package.zip',
        }
      : entryWithoutBlob;
  const metadata: PortableMediaMetadata = {
    entry: projectMediaEntryPrivacy(
      { ...portableEntry, size: collector.sizeOf(source.originalObjectId) },
      args.options
    ),
    originalObjectId: source.originalObjectId,
    ...(presentation ? { presentation } : {}),
    ...(source.recording ? { recording: source.recording } : {}),
    ...(thumbnail ? { thumbnail } : {}),
    ...(source.webSnapshot ? { webSnapshot: source.webSnapshot } : {}),
    ...(workspace ? { workspace } : {}),
  };
  return {
    descriptor: {
      mediaSubtype: 'library-item',
      metadataPath: `${METADATA_ROOT}/media/${encodeURIComponent(entry.id)}.json`,
      objectCount: collector.objects.length,
      rootId: entry.id,
      rootKind: 'media',
      totalBytes: collector.objects.reduce((total, object) => total + object.ref.size, 0),
    },
    load: async () => ({ metadata: metadata as unknown as JsonValue, objects: collector.objects }),
    summary: buildRootSummary({ entry, options: args.options, presentation, source, thumbnail }),
  };
}

export async function buildMediaRootInventory(args: {
  db: MediaInventoryDatabase;
  items: MediaLibraryItem[];
  options: MediaHubBackupExportOptions;
  paths: ArchivePathAllocator;
}): Promise<MediaHubBackupRootInventoryItem[]> {
  const roots: MediaHubBackupRootInventoryItem[] = [];
  const items = args.items
    .filter((item) => selected(item, args.options))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const [rootIndex, item] of items.entries()) {
    roots.push(await buildMediaRoot({ ...args, item, rootIndex }));
  }
  return roots;
}
