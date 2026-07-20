import type JSZip from 'jszip';
import {
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  RECORDING_TELEMETRY_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import type { MediaThumbnailEntry } from '../../../../composition/persistence/media-library/contracts';
import type {
  ProjectAssetEntry,
  ProjectExportEntry,
} from '../../../../composition/persistence/projects/contracts';
import { UnsupportedEngine1VideoProjectError } from '../../../../composition/persistence/projects/contracts';
import type {
  RecordingEntry,
  RecordingTelemetryEntry,
} from '../../../../composition/persistence/recordings/contracts';
import type { initDB } from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { parseVideoProjectEntryResult } from '../../../../composition/persistence/projects/read-guards';
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
  const thumbnail = (await db.get(THUMBNAILS_STORE, `video-project:${entry.id}`)) as
    | MediaThumbnailEntry
    | undefined;
  assertBackupExportNotCancelled(signal);

  return normalizeVideoProject({
    entry: createBackupVideoProjectEntry(entry),
    ...(effectProject ? { effectProject } : {}),
    projectAssets,
    projectExports,
    ...(thumbnail
      ? {
          thumbnail: createBackupBlobDescriptor(
            zip,
            budget,
            `video-projects/${projectSegment}/thumbnail`,
            thumbnail,
            signal
          ),
        }
      : {}),
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
    const asset = (await db.get(PROJECT_ASSETS_STORE, assetId)) as ProjectAssetEntry | undefined;
    assertBackupExportNotCancelled(signal);
    if (!asset) {
      continue;
    }

    projectAssets.push(
      createBackupBlobDescriptor(
        zip,
        budget,
        `video-projects/${entry.id}/assets/${safeBackupPathSegment(assetId, 'video project asset id')}`,
        asset,
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
  const exports = (await db.getAllFromIndex(
    PROJECT_EXPORTS_STORE,
    'projectId',
    projectId
  )) as ProjectExportEntry[];
  assertBackupExportNotCancelled(signal);
  const descriptors: VideoBackupProjectDescriptor['projectExports'] = [];

  for (const entry of exports) {
    assertBackupExportNotCancelled(signal);
    const recording = (await db.get(STORE_NAME, entry.recordingId)) as RecordingEntry | undefined;
    assertBackupExportNotCancelled(signal);
    if (!recording) {
      continue;
    }

    descriptors.push(
      await buildVideoProjectExportDescriptor(
        db,
        zip,
        budget,
        projectId,
        entry,
        recording,
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
  entry: ProjectExportEntry,
  recording: RecordingEntry,
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
  const recordingTelemetry = options.includeTelemetry
    ? ((await db.get(RECORDING_TELEMETRY_STORE, entry.recordingId)) as
        | RecordingTelemetryEntry
        | undefined)
    : undefined;
  assertBackupExportNotCancelled(signal);

  return {
    entry,
    recording: createBackupBlobDescriptor(
      zip,
      budget,
      `video-projects/${projectSegment}/exports/${exportSegment}`,
      recording,
      signal
    ),
    ...(recordingTelemetry ? { recordingTelemetry } : {}),
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
