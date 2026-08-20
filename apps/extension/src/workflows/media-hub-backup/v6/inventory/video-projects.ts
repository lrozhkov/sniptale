import { parseAggregatePresentationEntry } from '../../../../composition/persistence/aggregate-presentations/parser';
import { createAggregatePresentationKey } from '../../../../composition/persistence/aggregate-presentations/contracts';
import { parseMediaThumbnailEntry } from '../../../../composition/persistence/media-library/read-guards';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import {
  parseProjectAssetEntry,
  parseProjectExportEntry,
  parseVideoProjectEntryResult,
} from '../../../../composition/persistence/projects/read-guards';
import {
  UnsupportedEngine1VideoProjectError,
  type VideoProjectEntry,
} from '../../../../composition/persistence/projects/contracts';
import { verifyVideoProjectEffectSnapshotIntegrity } from '../../../../features/video/project/effect-instance';
import { encodePortablePresentation, encodePortableThumbnail } from '../root-codecs/media';
import type { PortableVideoProjectMetadata } from '../root-codecs/projects';
import type { JsonValue, MediaHubBackupExportOptions } from '../contracts';
import type { MediaHubBackupRootInventoryItem } from '../export';
import { createObjectCollector, readInventoryAssetFile, type InventoryDatabase } from './helpers';

function selected(
  id: string,
  lifecycle: { storageClass: string } | undefined,
  options: MediaHubBackupExportOptions
) {
  if (lifecycle?.storageClass === 'temporary') return false;
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
  for (const id of ids) {
    const asset = parseProjectAssetEntry(await db.get(PROJECT_ASSETS_STORE, id));
    if (!asset) throw new Error(`Video project asset is invalid: ${id}.`);
    const file = await readInventoryAssetFile(db, asset.assetId, asset.id);
    const { assetId: _assetId, ...portable } = asset;
    output.push({
      entry: portable,
      filename: file.name || asset.id,
      objectId: collector.addObject(file, file.name || asset.id, asset.mimeType),
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
      objectId: collector.addObject(file, exportEntry.filename, exportEntry.mimeType),
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
}): Promise<MediaHubBackupRootInventoryItem> {
  await verifyVideoProjectEffectSnapshotIntegrity(args.entry.project);
  const collector = createObjectCollector(`video-${String(args.index + 1).padStart(6, '0')}`);
  const [projectAssets, projectExports] = await Promise.all([
    buildProjectAssets(args.db, args.entry, collector),
    buildProjectExports(args.db, args.entry, collector),
  ]);
  const projectThumbnail = parseMediaThumbnailEntry(
    await args.db.get(THUMBNAILS_STORE, `video-project:${args.entry.id}`)
  );
  const presentation = parseAggregatePresentationEntry(
    await args.db.get(
      AGGREGATE_PRESENTATIONS_STORE,
      createAggregatePresentationKey({ id: args.entry.id, kind: 'video-project' })
    )
  );
  const { effectSnapshots: _effectSnapshots, ...project } = args.entry.project;
  const portableSnapshots = buildPortableEffectSnapshots(args.entry, collector);
  const metadata: PortableVideoProjectMetadata = {
    entry: {
      ...args.entry,
      project: { ...project, ...(portableSnapshots ? { effectSnapshots: portableSnapshots } : {}) },
    },
    projectAssets,
    projectExports,
    ...(projectThumbnail
      ? {
          thumbnail: encodePortableThumbnail(
            projectThumbnail,
            collector.addObject(
              projectThumbnail.blob,
              `${args.entry.id}-thumbnail`,
              projectThumbnail.blob.type || 'image/png'
            )
          ),
        }
      : {}),
    ...(presentation
      ? {
          presentation: encodePortablePresentation({
            entry: presentation,
            ...(presentation.previewBlob
              ? {
                  previewObjectId: collector.addObject(
                    presentation.previewBlob,
                    `${args.entry.id}-preview`,
                    presentation.previewBlob.type || 'image/png'
                  ),
                }
              : {}),
            thumbnailObjectId: collector.addObject(
              presentation.thumbnailBlob,
              `${args.entry.id}-presentation-thumbnail`,
              presentation.thumbnailBlob.type || 'image/png'
            ),
          }),
        }
      : {}),
  };
  return {
    descriptor: {
      metadataPath: `metadata/video-projects/${encodeURIComponent(args.entry.id)}.json`,
      objectCount: collector.objects.length,
      rootId: args.entry.id,
      rootKind: 'video-project',
      totalBytes: collector.objects.reduce((sum, object) => sum + object.ref.size, 0),
    },
    load: async () => ({ metadata: metadata as unknown as JsonValue, objects: collector.objects }),
    summary: {
      recordingCount: projectExports.length,
      sourceMetadataCount: 0,
      telemetryCount: 0,
      thumbnailCount:
        projectExports.filter((item) => item.thumbnail).length +
        (projectThumbnail ? 1 : 0) +
        (presentation ? 1 + (presentation.previewBlob ? 1 : 0) : 0),
      webSnapshotCount: 0,
    },
  };
}

export async function buildVideoProjectRootInventory(args: {
  db: InventoryDatabase;
  options: MediaHubBackupExportOptions;
}): Promise<MediaHubBackupRootInventoryItem[]> {
  const entries = readSelectedVideoProjects(
    await args.db.getAll(VIDEO_PROJECTS_STORE),
    args.options
  );
  const roots: MediaHubBackupRootInventoryItem[] = [];
  for (const [index, entry] of entries.entries()) {
    roots.push(await buildVideoProjectRoot({ db: args.db, entry, index }));
  }
  return roots;
}
