import {
  createEmptyVideoProject,
  createVideoProjectFromRecording,
} from '../../../features/video/project/factories/creation';
import { parseHydratableVideoProject } from '../../../features/video/project/validation/root';
import type { RecordingSidecarVideoProjectInput } from '../../../features/video/project/factories/recording-sidecar';
import { getRecordingTelemetry } from '../../../composition/persistence/recordings/telemetry';
import { getRecording } from '../../../composition/persistence/recordings/index';
import { getVideoProject } from '../../../composition/persistence/projects/index';
import { resolveVideoProjectReadResult } from '../../../composition/persistence/projects/contracts';
import { commitVideoProjectMutation } from '../../../composition/persistence/projects/index-mutations';
import { translate } from '../../../platform/i18n';
import { buildWebcamRecordingId } from '@sniptale/runtime-contracts/video/types/sidecar';
import {
  VideoProjectTrackRole,
  type VideoProject,
  type VideoProjectAsset,
} from '../../../features/video/project/types';
import { ensureRecordingAssets } from './assets';
import { loadVideoMetadata } from '../media-metadata';
import {
  normalizeRecordingActionEventsToProjectSpace,
  normalizeRecordingCursorTrackToProjectSpace,
} from './telemetry';

async function buildRecordingProject(
  asset: VideoProjectAsset,
  entry: NonNullable<Awaited<ReturnType<typeof getRecording>>>,
  sourceRecordingId: string,
  sidecarVideos: RecordingSidecarVideoProjectInput[]
): Promise<VideoProject> {
  const metadata = await loadVideoMetadata(entry.file);
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
          sourceNormalizedActionEvents: normalizeRecordingActionEventsToProjectSpace(
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

function buildWebcamSidecarVideo(
  asset: VideoProjectAsset,
  sourceRecordingId: string
): RecordingSidecarVideoProjectInput {
  return {
    recordingId: buildWebcamRecordingId(sourceRecordingId),
    filename: asset.name,
    width: asset.metadata.width,
    height: asset.metadata.height,
    duration: asset.metadata.duration ?? 0.1,
    mimeType: asset.metadata.mimeType,
    size: asset.metadata.size,
    asset,
    trackRole: VideoProjectTrackRole.CAMERA,
  };
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

  const assets = await ensureRecordingAssets(createEmptyVideoProject(), sourceRecordingId);
  const asset = assets[0]!;
  const sidecarVideos = assets
    .slice(1)
    .map((camera) => buildWebcamSidecarVideo(camera, sourceRecordingId));
  const nextProject = await buildRecordingProject(asset, entry, sourceRecordingId, sidecarVideos);
  return commitVideoProjectMutation(nextProject, { baseRevision: null });
}

/**
 * Creates and persists an empty project workspace.
 */
export async function createBlankProject(name?: string): Promise<VideoProject> {
  const nextProject = createEmptyVideoProject(name);

  return commitVideoProjectMutation(nextProject, { baseRevision: null });
}

/**
 * Resolves the initial project workspace from the current location params.
 */
export async function loadInitialProjectFromLocation(): Promise<{
  project: VideoProject | null;
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

  return {
    project: project ?? null,
    recordingId: recordingId ?? project?.baseRecordingId ?? null,
  };
}

export async function openPersistedProject(projectId: string): Promise<VideoProject> {
  const result = await getVideoProject(projectId);
  if (result.status === 'ready' && result.lifecycle?.trashedAt !== undefined)
    throw new Error('Video project is unavailable.');
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

  const retainedProject =
    result.status === 'ready' && result.lifecycle?.storageClass === 'temporary'
      ? await commitVideoProjectMutation(persistedProject, {
          baseRevision: persistedProject.updatedAt,
          expectedWorkspaceRevision: result.workspaceRevision,
        })
      : persistedProject;
  return retainedProject;
}

/** Copies the editable document; immutable media references remain shared and reference-counted. */
export async function copyProject(project: VideoProject, name: string): Promise<VideoProject> {
  const copy = structuredClone(project);
  copy.id = crypto.randomUUID();
  copy.name = name;
  copy.createdAt = Date.now();
  copy.updatedAt = copy.createdAt;
  return commitVideoProjectMutation(copy, { baseRevision: null });
}
