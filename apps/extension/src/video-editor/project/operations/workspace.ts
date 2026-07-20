import {
  createEmptyVideoProject,
  createVideoProjectFromRecording,
} from '../../../features/video/project/factories/creation';
import { parseHydratableVideoProject } from '../../../features/video/project/validation/root';
import type { RecordingSidecarVideoProjectInput } from '../../../features/video/project/factories/recording-sidecar';
import { getRecordingTelemetry } from '../../../composition/persistence/recordings/telemetry';
import { getRecording } from '../../../composition/persistence/recordings/index';
import {
  deleteProjectAsset,
  getVideoProject,
} from '../../../composition/persistence/projects/index';
import { resolveVideoProjectReadResult } from '../../../composition/persistence/projects/contracts';
import { commitVideoProjectMutation } from '../../../composition/persistence/projects/index-mutations';
import { translate } from '../../../platform/i18n';
import { buildWebcamRecordingId } from '@sniptale/runtime-contracts/video/types/sidecar';
import type { VideoProject, VideoProjectAsset } from '../../../features/video/project/types';
import { importRecordingProjectAsset } from './assets';
import { loadVideoMetadata } from '../media-metadata';
import {
  normalizeRecordingActionEventsToProjectSpace,
  normalizeRecordingCursorTrackToProjectSpace,
} from './telemetry';

type LegacyRecordingAsset = VideoProjectAsset & {
  source: {
    kind: 'recording';
    recordingId: string;
  };
};

async function buildRecordingProject(
  asset: VideoProjectAsset,
  entry: NonNullable<Awaited<ReturnType<typeof getRecording>>>,
  sourceRecordingId: string,
  sidecarVideos: RecordingSidecarVideoProjectInput[]
): Promise<VideoProject> {
  const metadata = await loadVideoMetadata(entry.blob);
  const telemetry = await getRecordingTelemetry(sourceRecordingId);
  const normalizedTelemetryParams = {
    captureMode: telemetry?.captureMode ?? null,
    displaySurface: telemetry?.displaySurface ?? null,
    projectHeight: metadata.height,
    projectWidth: metadata.width,
    viewport: telemetry?.viewport ?? null,
  };

  return createVideoProjectFromRecording({
    recordingId: sourceRecordingId,
    filename: entry.filename,
    width: metadata.width,
    height: metadata.height,
    duration: metadata.duration,
    mimeType: metadata.mimeType,
    size: entry.size,
    hasAudio: metadata.hasAudio,
    audioPeaks: metadata.audioPeaks,
    asset,
    sidecarVideos,
    ...(telemetry?.actionEvents === undefined
      ? {}
      : {
          actionEvents: normalizeRecordingActionEventsToProjectSpace(
            telemetry.actionEvents,
            normalizedTelemetryParams
          ),
        }),
    ...(telemetry?.cursorTrack === undefined
      ? {}
      : {
          cursorTrack: normalizeRecordingCursorTrackToProjectSpace(
            telemetry.cursorTrack,
            normalizedTelemetryParams
          ),
        }),
  });
}

function collectProjectAssetId(asset: VideoProjectAsset, projectAssetIds: string[]): void {
  if (asset.source.kind === 'project-asset') {
    projectAssetIds.push(asset.source.projectAssetId);
  }
}

async function loadWebcamSidecarVideos(
  sourceRecordingId: string,
  projectAssetIds: string[]
): Promise<RecordingSidecarVideoProjectInput[]> {
  const webcamRecordingId = buildWebcamRecordingId(sourceRecordingId);
  const entry = await getRecording(webcamRecordingId);
  if (!entry) {
    return [];
  }

  const asset = await importRecordingProjectAsset(webcamRecordingId);
  collectProjectAssetId(asset, projectAssetIds);
  return [
    {
      recordingId: webcamRecordingId,
      filename: entry.filename,
      width: asset.metadata.width,
      height: asset.metadata.height,
      duration: asset.metadata.duration ?? 0.1,
      mimeType: asset.metadata.mimeType,
      size: entry.size,
      asset,
    },
  ];
}

/**
 * Creates a new project seeded from an existing recording entry.
 */
async function createProjectFromRecordingId(sourceRecordingId: string): Promise<VideoProject> {
  const entry = await getRecording(sourceRecordingId);

  if (!entry) {
    throw new Error(
      [
        translate('videoEditor.app.recordingNotFoundPrefix'),
        sourceRecordingId,
        translate('videoEditor.app.recordingNotFoundSuffix'),
      ].join('')
    );
  }

  const createdProjectAssetIds: string[] = [];

  try {
    const asset = await importRecordingProjectAsset(sourceRecordingId);
    collectProjectAssetId(asset, createdProjectAssetIds);
    const sidecarVideos = await loadWebcamSidecarVideos(sourceRecordingId, createdProjectAssetIds);
    const nextProject = await buildRecordingProject(asset, entry, sourceRecordingId, sidecarVideos);
    await commitVideoProjectMutation(nextProject, { baseRevision: null });
    return nextProject;
  } catch (saveError) {
    await cleanupProjectAssetCopies(createdProjectAssetIds);
    throw saveError;
  }
}

function getLegacyRecordingAssets(project: VideoProject): LegacyRecordingAsset[] {
  return project.assets.filter(
    (asset): asset is LegacyRecordingAsset =>
      asset.type === 'RECORDING' && asset.source.kind === 'recording'
  );
}

function mergeMigratedRecordingAsset(
  asset: VideoProjectAsset,
  migratedAsset: VideoProjectAsset
): VideoProjectAsset {
  return {
    ...migratedAsset,
    id: asset.id,
    name: asset.name,
    createdAt: asset.createdAt,
  };
}

async function cleanupProjectAssetCopies(projectAssetIds: string[]): Promise<void> {
  await Promise.all(
    projectAssetIds.map(async (projectAssetId) => deleteProjectAsset(projectAssetId))
  );
}

async function migratePersistedRecordingAssets(project: VideoProject): Promise<VideoProject> {
  const legacyAssets = getLegacyRecordingAssets(project);
  if (legacyAssets.length === 0) {
    return project;
  }

  const migratedAssetMap = new Map<string, VideoProjectAsset>();
  const createdProjectAssetIds: string[] = [];

  try {
    for (const asset of legacyAssets) {
      const migratedAsset = await importRecordingProjectAsset(asset.source.recordingId);
      if (migratedAsset.source.kind === 'project-asset') {
        createdProjectAssetIds.push(migratedAsset.source.projectAssetId);
      }
      migratedAssetMap.set(asset.id, mergeMigratedRecordingAsset(asset, migratedAsset));
    }
  } catch {
    await cleanupProjectAssetCopies(createdProjectAssetIds);
    return project;
  }

  const migratedProject = {
    ...project,
    assets: project.assets.map((asset) => migratedAssetMap.get(asset.id) ?? asset),
  };

  try {
    await commitVideoProjectMutation(migratedProject, { baseRevision: project.updatedAt });
  } catch (saveError) {
    await cleanupProjectAssetCopies(createdProjectAssetIds);
    throw saveError;
  }

  return migratedProject;
}

/**
 * Creates and persists an empty project workspace.
 */
export async function createBlankProject(): Promise<VideoProject> {
  const nextProject = createEmptyVideoProject();

  await commitVideoProjectMutation(nextProject, { baseRevision: null });
  return nextProject;
}

/**
 * Resolves the initial project workspace from the current location params.
 */
export async function loadInitialProjectFromLocation(): Promise<{
  project: VideoProject;
  recordingId: string | null;
}> {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('project');
  const rootRecordingId = params.get('id');
  let project: VideoProject | undefined;
  let recordingId = rootRecordingId;

  if (projectId) {
    project = await openPersistedProject(projectId);
  }

  if (!project && rootRecordingId) {
    project = await createProjectFromRecordingId(rootRecordingId);
  }

  if (!project) {
    project = await createBlankProject();
    recordingId = project.baseRecordingId;
  }

  return {
    project,
    recordingId: recordingId ?? project.baseRecordingId,
  };
}

export async function openPersistedProject(projectId: string): Promise<VideoProject> {
  const result = await getVideoProject(projectId);
  const storedProject = resolveVideoProjectReadResult(result);
  const persistedProject = storedProject ? parseHydratableVideoProject(storedProject) : null;

  if (!persistedProject) {
    throw new Error(
      [
        translate('videoEditor.app.projectNotFoundPrefix'),
        projectId,
        translate('videoEditor.app.projectNotFoundSuffix'),
      ].join('')
    );
  }

  return migratePersistedRecordingAssets(persistedProject);
}
