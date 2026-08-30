import type { ArchivePathAllocator } from '../../../../composition/archive-transfer';
import { parseMediaThumbnailEntry } from '../../../../composition/persistence/media-library/read-guards';
import {
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  MEDIA_LIBRARY_STORE,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import {
  parseProjectAssetEntry,
  parseProjectExportEntry,
  parseVideoProjectEntryResult,
} from '../../../../composition/persistence/projects/read-guards';
import { parseMediaLibraryEntry } from '../../../../composition/persistence/media-library/read-guards';
import { createProjectAssetMediaId } from '../../../../features/media-hub/media-id';
import {
  UnsupportedEngine1VideoProjectError,
  type VideoProjectEntry,
} from '../../../../composition/persistence/projects/contracts';
import { verifyVideoProjectEffectSnapshotIntegrity } from '../../../../features/video/project/effect-instance';
import { encodePortableThumbnail } from '../root-codecs/media';
import type { PortableVideoProjectMetadata } from '../root-codecs/projects';
import type { JsonValue, MediaHubBackupExportOptions } from '../contracts';
import type { MediaHubBackupRootInventoryItem } from '../export';
import {
  createObjectCollector,
  createReadableAssetFilename,
  readInventoryAssetFile,
  type InventoryDatabase,
} from './helpers';
import { METADATA_ROOT, withDraftRoot } from '../layout';
import { buildPortableAggregatePresentation } from './presentation';

function selected(
  id: string,
  lifecycle: { storageClass: string } | undefined,
  options: MediaHubBackupExportOptions
) {
  if (lifecycle?.storageClass === 'temporary' && !options.includeDrafts) return false;
  return options.scope === 'all' || Boolean(options.selected?.videoProjectIds.includes(id));
}

function readSelectedVideoProjects(
  rows: unknown[],
  options: MediaHubBackupExportOptions
): VideoProjectEntry[] {
  return rows
    .flatMap((raw) => {
      const result = parseVideoProjectEntryResult(raw);
      if (result.status === 'unsupported') {
        throw new UnsupportedEngine1VideoProjectError(result.metadata);
      }
      if (result.status === 'invalid') {
        throw new Error('Stored video project is invalid and cannot be exported.');
      }
      return result.status === 'ready' && selected(result.entry.id, result.entry.lifecycle, options)
        ? [result.entry]
        : [];
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function buildProjectAssets(
  db: InventoryDatabase,
  entry: VideoProjectEntry,
  collector: ReturnType<typeof createObjectCollector>
) {
  const output = [];
  const ids = [
    ...new Set(
      entry.project.assets.flatMap((asset) =>
        asset.source.kind === 'project-asset' ? [asset.source.projectAssetId] : []
      )
    ),
  ];
  for (const [index, id] of ids.entries()) {
    const asset = parseProjectAssetEntry(await db.get(PROJECT_ASSETS_STORE, id));
    if (!asset) throw new Error(`Video project asset is invalid: ${id}.`);
    const media = parseMediaLibraryEntry(
      await db.get(MEDIA_LIBRARY_STORE, createProjectAssetMediaId(asset.id))
    );
    const filename = media?.filename ?? createReadableAssetFilename(index, asset.mimeType);
    const file = await readInventoryAssetFile(db, asset.assetId, filename);
    const { assetId: _assetId, ...portable } = asset;
    output.push({
      entry: portable,
      filename,
      objectId: collector.addObject(
        file,
        filename,
        asset.mimeType,
        withDraftRoot(entry.lifecycle?.storageClass === 'temporary', [
          'Recordings',
          'Projects',
          entry.project.name,
          'Assets',
        ])
      ),
    });
  }
  return output;
}

async function buildProjectExports(
  db: InventoryDatabase,
  entry: VideoProjectEntry,
  collector: ReturnType<typeof createObjectCollector>
) {
  const output = [];
  const exports = (await db.getAllFromIndex(PROJECT_EXPORTS_STORE, 'projectId', entry.id))
    .map(parseProjectExportEntry)
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const exportEntry of exports) {
    const file = await readInventoryAssetFile(db, exportEntry.assetId, exportEntry.filename);
    const { assetId: _assetId, ...portable } = exportEntry;
    const thumbnail = parseMediaThumbnailEntry(
      await db.get(THUMBNAILS_STORE, `export:${exportEntry.id}`)
    );
    output.push({
      entry: portable,
      objectId: collector.addObject(
        file,
        exportEntry.filename,
        exportEntry.mimeType,
        withDraftRoot(entry.lifecycle?.storageClass === 'temporary', [
          'Exports',
          entry.project.name,
        ])
      ),
      ...(thumbnail
        ? {
            thumbnail: encodePortableThumbnail(
              thumbnail,
              collector.addObject(
                thumbnail.blob,
                `${exportEntry.id}-thumbnail`,
                thumbnail.blob.type || 'image/png'
              )
            ),
          }
        : {}),
    });
  }
  return output;
}

function buildPortableEffectSnapshots(
  entry: VideoProjectEntry,
  collector: ReturnType<typeof createObjectCollector>
) {
  return entry.project.effectSnapshots?.map((snapshot) => {
    const { assets, ...snapshotMetadata } = snapshot;
    return {
      ...snapshotMetadata,
      assets: assets.map(({ blob, ...asset }) => ({
        ...asset,
        objectId: collector.addObject(blob, `${snapshot.id}-${asset.id}`, asset.mimeType),
      })),
    };
  });
}

async function buildVideoProjectRoot(args: {
  db: InventoryDatabase;
  entry: VideoProjectEntry;
  index: number;
  paths: ArchivePathAllocator;
}): Promise<MediaHubBackupRootInventoryItem> {
  await verifyVideoProjectEffectSnapshotIntegrity(args.entry.project);
  const collector = createObjectCollector(
    `video-${String(args.index + 1).padStart(6, '0')}`,
    args.paths
  );
  const projectAssets = await buildProjectAssets(args.db, args.entry, collector);
  const projectExports = await buildProjectExports(args.db, args.entry, collector);
  const { effectSnapshots: _effectSnapshots, ...project } = args.entry.project;
  const portableSnapshots = buildPortableEffectSnapshots(args.entry, collector);
  const storedProjectThumbnail = parseMediaThumbnailEntry(
    await args.db.get(THUMBNAILS_STORE, `video-project:${args.entry.id}`)
  );
  const projectThumbnail = storedProjectThumbnail
    ? encodePortableThumbnail(
        storedProjectThumbnail,
        collector.addObject(
          storedProjectThumbnail.blob,
          `${args.entry.id}-thumbnail`,
          storedProjectThumbnail.blob.type || 'image/png'
        )
      )
    : undefined;
  const presentation = await buildPortableAggregatePresentation({
    addObject: collector.addObject,
    aggregateId: args.entry.id,
    aggregateKind: 'video-project',
    db: args.db,
  });
  const metadata: PortableVideoProjectMetadata = {
    entry: {
      ...args.entry,
      project: { ...project, ...(portableSnapshots ? { effectSnapshots: portableSnapshots } : {}) },
    },
    projectAssets,
    projectExports,
    ...(projectThumbnail ? { thumbnail: projectThumbnail } : {}),
    ...(presentation ? { presentation } : {}),
  };
  return {
    descriptor: {
      metadataPath: `${METADATA_ROOT}/video-projects/${encodeURIComponent(args.entry.id)}.json`,
      objectCount: collector.objects.length,
      rootId: args.entry.id,
      rootKind: 'video-project',
      totalBytes: collector.objects.reduce((sum, object) => sum + object.ref.size, 0),
    },
    load: async () => ({ metadata: metadata as unknown as JsonValue, objects: collector.objects }),
    summary: {
      draftCount: args.entry.lifecycle?.storageClass === 'temporary' ? 1 : 0,
      recordingCount: projectExports.length,
      sourceMetadataCount: 0,
      telemetryCount: 0,
      thumbnailCount:
        projectExports.filter((item) => item.thumbnail).length +
        (projectThumbnail ? 1 : 0) +
        (presentation ? 1 + (presentation.previewObjectId ? 1 : 0) : 0),
      webSnapshotCount: 0,
    },
  };
}

export async function buildVideoProjectRootInventory(args: {
  db: InventoryDatabase;
  options: MediaHubBackupExportOptions;
  paths: ArchivePathAllocator;
}): Promise<MediaHubBackupRootInventoryItem[]> {
  const entries = readSelectedVideoProjects(
    await args.db.getAll(VIDEO_PROJECTS_STORE),
    args.options
  );
  const roots: MediaHubBackupRootInventoryItem[] = [];
  for (const [index, entry] of entries.entries()) {
    roots.push(await buildVideoProjectRoot({ ...args, entry, index }));
  }
  return roots;
}
