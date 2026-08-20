import type JSZip from 'jszip';
import {
  PROJECT_ASSETS_STORE,
  ASSET_REFS_STORE,
  PROJECT_EXPORTS_STORE,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import type { MediaThumbnailEntry } from '../../../../composition/persistence/media-library/contracts';
import type { StoredProjectExportEntry } from '../../../../composition/persistence/projects/contracts';
import { UnsupportedEngine1VideoProjectError } from '../../../../composition/persistence/projects/contracts';
import { parseAssetRef, readAssetFile } from '../../../../composition/persistence/assets';
import type { initDB } from '../../../../composition/persistence/infrastructure/indexed-db/core';
import {
  parseProjectAssetEntry,
  parseProjectExportEntry,
  parseVideoProjectEntryResult,
} from '../../../../composition/persistence/projects/read-guards';
import type { parseVideoProjectEntry } from '../../../../composition/persistence/projects/read-guards';
import { assertBackupExportNotCancelled, type BackupExportBudget } from '../blob/budget';
import { createBackupBlobDescriptor } from '../blob/descriptor';
import { shouldExportVideoProject } from '../filters';
import { verifyVideoProjectEffectSnapshotIntegrity } from '../../../../features/video/project/effect-instance';
import { normalizeVideoProject } from '../../metadata/projects';
import { safeBackupPathSegment } from '../../metadata/path-segments';
import type {
  MediaHubBackupExportOptions,
  VideoBackupProjectDescriptor,
} from '../../contracts/types';
import {
  buildEffectProjectDescriptor,
  createBackupVideoProjectEntry,
} from './video-effect-descriptor';
import { appendAggregatePresentation } from '../presentation';

type ExportDatabase = Awaited<ReturnType<typeof initDB>>;

export async function buildVideoProjectDescriptors(
  db: ExportDatabase,
  zip: JSZip,
  budget: BackupExportBudget,
  options: MediaHubBackupExportOptions,
  signal?: AbortSignal | undefined
): Promise<VideoBackupProjectDescriptor[]> {
  assertBackupExportNotCancelled(signal);
  const projects = (await db.getAll(VIDEO_PROJECTS_STORE))
    .map(parseVideoProjectEntryResult)
    .flatMap((result) => {
      if (result.status === 'unsupported') {
        throw new UnsupportedEngine1VideoProjectError(result.metadata);
      }
      if (result.status === 'invalid') {
        throw new Error('Stored video project is invalid and cannot be exported.');
      }
      return result.status === 'ready' ? [result.entry] : [];
    })
    .filter((entry) => shouldExportVideoProject(entry, options));
  assertBackupExportNotCancelled(signal);
  const descriptors: VideoBackupProjectDescriptor[] = [];

  for (const entry of projects) {
    assertBackupExportNotCancelled(signal);
    descriptors.push(await buildVideoProjectDescriptor(db, zip, budget, entry, options, signal));
  }

  return descriptors;
}

async function buildVideoProjectDescriptor(
  db: ExportDatabase,
  zip: JSZip,
  budget: BackupExportBudget,
  entry: NonNullable<Awaited<ReturnType<typeof parseVideoProjectEntry>>>,
  options: MediaHubBackupExportOptions,
  signal: AbortSignal | undefined
): Promise<VideoBackupProjectDescriptor> {
  await verifyVideoProjectEffectSnapshotIntegrity(entry.project);
  const projectSegment = safeBackupPathSegment(entry.id, 'video project id');
  const projectAssets = await buildVideoProjectAssetDescriptors(db, zip, budget, entry, signal);
  const effectProject = buildEffectProjectDescriptor(zip, budget, entry, signal);
  const projectExports = await buildVideoProjectExportDescriptors(
    db,
    zip,
    budget,
    entry.id,
    options,
    signal
  );
  assertBackupExportNotCancelled(signal);
  const presentation = await appendAggregatePresentation({
    aggregateId: entry.id,
    aggregateKind: 'video-project',
    budget,
    db,
    pathPrefix: `aggregate-presentations/video-project/${projectSegment}`,
    signal,
    zip,
  });
  assertBackupExportNotCancelled(signal);

  return normalizeVideoProject({
    entry: createBackupVideoProjectEntry(entry),
    ...(effectProject ? { effectProject } : {}),
    projectAssets,
    projectExports,
    ...(presentation ? { presentation } : {}),
  });
}

async function buildVideoProjectAssetDescriptors(
  db: ExportDatabase,
  zip: JSZip,
  budget: BackupExportBudget,
  entry: Awaited<ReturnType<typeof parseVideoProjectEntry>>,
  signal: AbortSignal | undefined
): Promise<VideoBackupProjectDescriptor['projectAssets']> {
  if (!entry) {
    return [];
  }

  const projectAssetIds = entry.project.assets.flatMap((asset) =>
    asset.source.kind === 'project-asset' ? [asset.source.projectAssetId] : []
  );
  const projectAssets: VideoBackupProjectDescriptor['projectAssets'] = [];
  for (const assetId of projectAssetIds) {
    assertBackupExportNotCancelled(signal);
    const asset = parseProjectAssetEntry(await db.get(PROJECT_ASSETS_STORE, assetId));
    assertBackupExportNotCancelled(signal);
    if (!asset) {
      continue;
    }
    const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, asset.assetId));
    if (!ref) continue;
    const file = await readAssetFile(ref, asset.id);

    projectAssets.push(
      createBackupBlobDescriptor(
        zip,
        budget,
        `video-projects/${entry.id}/assets/${safeBackupPathSegment(assetId, 'video project asset id')}`,
        {
          blob: file,
          createdAt: asset.createdAt,
          id: asset.id,
          mimeType: asset.mimeType,
          size: asset.size,
        },
        signal
      )
    );
  }

  return projectAssets;
}

async function buildVideoProjectExportDescriptors(
  db: ExportDatabase,
  zip: JSZip,
  budget: BackupExportBudget,
  projectId: string,
  options: MediaHubBackupExportOptions,
  signal: AbortSignal | undefined
): Promise<VideoBackupProjectDescriptor['projectExports']> {
  assertBackupExportNotCancelled(signal);
  const exports = (await db.getAllFromIndex(PROJECT_EXPORTS_STORE, 'projectId', projectId))
    .map(parseProjectExportEntry)
    .filter((entry): entry is StoredProjectExportEntry => entry !== null);
  assertBackupExportNotCancelled(signal);
  const descriptors: VideoBackupProjectDescriptor['projectExports'] = [];

  for (const entry of exports) {
    assertBackupExportNotCancelled(signal);
    const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, entry.assetId));
    if (!ref) continue;
    const file = await readAssetFile(ref, entry.filename);

    descriptors.push(
      await buildVideoProjectExportDescriptor(
        db,
        zip,
        budget,
        projectId,
        entry,
        file,
        options,
        signal
      )
    );
  }

  return descriptors;
}

async function buildVideoProjectExportDescriptor(
  db: ExportDatabase,
  zip: JSZip,
  budget: BackupExportBudget,
  projectId: string,
  entry: StoredProjectExportEntry,
  file: File,
  options: MediaHubBackupExportOptions,
  signal: AbortSignal | undefined
): Promise<VideoBackupProjectDescriptor['projectExports'][number]> {
  const projectSegment = safeBackupPathSegment(projectId, 'video project id');
  const exportSegment = safeBackupPathSegment(entry.id, 'video project export id');
  assertBackupExportNotCancelled(signal);
  const thumbnail = (await db.get(THUMBNAILS_STORE, `export:${entry.id}`)) as
    | MediaThumbnailEntry
    | undefined;
  assertBackupExportNotCancelled(signal);
  void options;

  return {
    entry: {
      createdAt: entry.createdAt,
      duration: entry.duration,
      filename: entry.filename,
      fps: entry.fps,
      height: entry.height,
      id: entry.id,
      projectId: entry.projectId,
      recordingId: entry.id,
      size: entry.size,
      width: entry.width,
      ...(entry.format ? { format: entry.format } : {}),
      ...(entry.mimeType ? { mimeType: entry.mimeType } : {}),
    },
    recording: createBackupBlobDescriptor(
      zip,
      budget,
      `video-projects/${projectSegment}/exports/${exportSegment}`,
      {
        blob: file,
        createdAt: entry.createdAt,
        filename: entry.filename,
        id: entry.id,
        mimeType: entry.mimeType ?? 'video/webm',
        size: entry.size,
      },
      signal
    ),
    ...(thumbnail
      ? {
          thumbnail: createBackupBlobDescriptor(
            zip,
            budget,
            `video-projects/${projectSegment}/exports/${exportSegment}.thumb`,
            thumbnail,
            signal
          ),
        }
      : {}),
  };
}
