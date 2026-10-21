import type { VideoWorkspaceSnapshot } from '../../../composition/persistence/review-workspaces/contracts';
import {
  replayReviewHistory,
  reviewDocumentBaseline,
} from '../../../features/video/review/document';
import { planReviewProjectConversion } from '../../../features/video/review/project-conversion';
import type { ReviewProjectAudioResources } from '../../../features/video/review/project-audio';
import type { ReviewDocument } from '../../../features/video/review/types';
import { loadAudioMetadata } from '../media-metadata';
import { buildMaterialPlacement } from '../state/insertion/material-plan';
import { syncProjectDuration } from '../../../features/video/project/timeline/basics';
import { projectRecordingObservationClock } from '../../../features/video/project/observation-clock';
import { readVideoWorkspace } from '../../../composition/persistence/review-workspaces/store';
import { applyRecordingReviewInteractions } from '../../../features/video/review/standalone-interactions';
import {
  createEmptyVideoProject,
  createVideoProjectFromRecording,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../features/video/project/factories/creation';
import { parseHydratableVideoProject } from '../../../features/video/project/validation/root';
import type { RecordingSidecarVideoProjectInput } from '../../../features/video/project/factories/recording-sidecar';
import { getRecordingTelemetry } from '../../../composition/persistence/recordings/telemetry';
import { getRecording } from '../../../composition/persistence/recordings/index';
import { getVideoProject, getProjectAsset } from '../../../composition/persistence/projects/index';
import { resolveVideoProjectReadResult } from '../../../composition/persistence/projects/contracts';
import { commitVideoProjectMutation } from '../../../composition/persistence/projects/index-mutations';
import { translate } from '../../../platform/i18n';
import { buildWebcamRecordingId } from '@sniptale/runtime-contracts/video/types/sidecar';
import {
  VideoProjectTrackRole,
  type VideoProject,
  type VideoProjectAsset,
} from '../../../features/video/project/types';
import { ensureRecordingAssets, ensureLibraryMediaAssets } from './assets';
import {
  normalizeRecordingActionEventsToProjectSpace,
  normalizeRecordingCursorTrackToProjectSpace,
} from './telemetry';

async function buildRecordingSourceProject(
  asset: VideoProjectAsset,
  entry: NonNullable<Awaited<ReturnType<typeof getRecording>>>,
  sourceRecordingId: string,
  sidecarVideos: RecordingSidecarVideoProjectInput[]
): Promise<VideoProject> {
  const metadata = asset.metadata;
  const duration = metadata.duration;
  if (duration === null || !Number.isFinite(duration) || duration <= 0)
    throw new Error('Recording video metadata is unavailable.');
  const rawTelemetry = await getRecordingTelemetry(sourceRecordingId);
  const telemetry = rawTelemetry ? projectRecordingObservationClock(rawTelemetry) : undefined;
  const normalizedTelemetryParams = {
    captureMode: telemetry?.captureMode ?? null,
    displaySurface: telemetry?.displaySurface ?? null,
    projectHeight: metadata.height,
    projectWidth: metadata.width,
    viewport: telemetry?.viewport ?? null,
  };

  const project = createVideoProjectFromRecording({
    recordingId: sourceRecordingId,
    filename: entry.filename,
    width: metadata.width,
    height: metadata.height,
    duration,
    mimeType: metadata.mimeType,
    size: entry.size,
    hasAudio: metadata.hasAudio,
    audioPeaks: metadata.audioPeaks,
    asset,
    sidecarVideos,
    ...(telemetry ? { recordingSignals: telemetry.signals } : {}),
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
  return project;
}

async function buildRecordingProject(
  asset: VideoProjectAsset,
  entry: NonNullable<Awaited<ReturnType<typeof getRecording>>>,
  sourceRecordingId: string,
  sidecarVideos: RecordingSidecarVideoProjectInput[]
): Promise<VideoProject> {
  const project = await buildRecordingSourceProject(asset, entry, sourceRecordingId, sidecarVideos);
  const metadata = asset.metadata;
  const duration = metadata.duration!;
  const snapshot = await readVideoWorkspace(`recording:${sourceRecordingId}`);
  if (!snapshot) return project;
  const { source, sourceAssetId } = snapshot.workspace;
  if (
    sourceAssetId !== entry.assetId ||
    source.size !== entry.size ||
    source.mimeType !== metadata.mimeType ||
    source.width !== metadata.width ||
    source.height !== metadata.height ||
    Math.abs(source.duration - duration) > 0.001
  )
    throw new Error('Review interaction source has changed.');
  return applyRecordingReviewInteractions(project, sourceRecordingId, snapshot.workspace.advanced);
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

/** Resolves existing immutable audio before the new root claims its references. */
async function prepareReviewAudioResources(
  project: VideoProject,
  document: ReviewDocument
): Promise<ReviewProjectAudioResources | undefined> {
  const audio = document.advancedContent.audio;
  const ids = new Set([
    ...[...audio.voiceover, ...audio.music].flatMap((take) => [
      take.assetId,
      ...(take.transcript?.replacements ?? []).map((replacement) => replacement.assetId),
    ]),
    ...(audio.originalSpeech?.transcript.replacements ?? []).map(
      (replacement) => replacement.assetId
    ),
  ]);
  if (!ids.size && audio.laneVolumes === undefined) return undefined;
  const assets: ReviewProjectAudioResources['assets'][number][] = [];
  for (const id of ids) {
    if (!id.startsWith('project-asset:') || id.length <= 'project-asset:'.length)
      throw new Error('Review audio resource is unavailable.');
    const projectAssetId = id.slice('project-asset:'.length);
    const result = await getProjectAsset(projectAssetId);
    if (result.status !== 'ready' || result.entry.id !== projectAssetId)
      throw new Error('Review audio resource is unavailable.');
    const metadata = await loadAudioMetadata(result.entry.file);
    const asset = createVideoProjectAsset(
      result.entry.file.name || id,
      'AUDIO',
      { kind: 'project-asset', projectAssetId },
      { ...metadata, width: 0, height: 0 }
    );
    assets.push({ reviewAssetId: id, asset: { ...asset, id } });
  }
  return {
    assets,
    tracks: {
      voiceover: createVideoProjectTrack(
        translate('gallery.videoReview.audioVoiceover'),
        project.tracks.length + 1,
        'AUDIO'
      ),
      music: createVideoProjectTrack(
        translate('gallery.videoReview.audioMusic'),
        project.tracks.length + 2,
        'AUDIO'
      ),
    },
  };
}

function matchesReviewSnapshot(
  snapshot: VideoWorkspaceSnapshot | null,
  aggregateId: string,
  revision: number,
  createdAt: number,
  sourceAssetId: string
): snapshot is VideoWorkspaceSnapshot {
  return (
    !!snapshot &&
    snapshot.workspace.aggregateId === aggregateId &&
    snapshot.workspace.revision === revision &&
    snapshot.workspace.createdAt === createdAt &&
    snapshot.workspace.sourceAssetId === sourceAssetId
  );
}

/** Creates an independent Montage document from the exact selected saved Gallery project. */
async function createProjectFromReview(
  aggregateId: string,
  revision: number,
  createdAt: number,
  sourceAssetId: string
): Promise<VideoProject> {
  const snapshot = await readVideoWorkspace(aggregateId);
  if (!matchesReviewSnapshot(snapshot, aggregateId, revision, createdAt, sourceAssetId))
    throw new Error('Review project changed before transfer.');
  const document = replayReviewHistory(
    snapshot.workspace.history,
    snapshot.workspace.cursor,
    snapshot.workspace.source,
    reviewDocumentBaseline(snapshot.workspace)
  );
  const name = snapshot.workspace.project?.name;
  const empty = createEmptyVideoProject(
    name,
    snapshot.workspace.source.width,
    snapshot.workspace.source.height
  );
  const assets = await ensureLibraryMediaAssets(empty, aggregateId);
  const primary = assets[0];
  if (!primary || (primary.type !== 'VIDEO' && primary.type !== 'RECORDING'))
    throw new Error('Review video source is unavailable.');
  let seed: VideoProject;
  if (primary.source.kind === 'recording') {
    const recordingId = primary.source.recordingId;
    const entry = await getRecording(recordingId);
    if (!entry || entry.assetId !== snapshot.workspace.sourceAssetId)
      throw new Error('Review video source changed before transfer.');
    seed = await buildRecordingSourceProject(
      primary,
      entry,
      recordingId,
      assets.slice(1).map((asset) => buildWebcamSidecarVideo(asset, recordingId))
    );
  } else {
    seed = syncProjectDuration(
      buildMaterialPlacement({ ...empty, assets }, primary, 0, 'append').project
    );
  }
  const externalAudio = await prepareReviewAudioResources(seed, document);
  const result = planReviewProjectConversion({
    seed,
    name: name ?? primary.name,
    source: snapshot.workspace.source,
    document,
    ui: snapshot.workspace.advanced.ui,
    ...(externalAudio ? { externalAudio } : {}),
  });
  if (result.status !== 'prepared')
    throw new Error('Review project settings cannot be transferred.');
  const latest = await readVideoWorkspace(aggregateId);
  if (
    !matchesReviewSnapshot(
      latest,
      aggregateId,
      revision,
      createdAt,
      snapshot.workspace.sourceAssetId
    )
  )
    throw new Error('Review project changed before transfer.');
  return commitVideoProjectMutation(result.project, {
    baseRevision: null,
    expectedReviewWorkspace: snapshot.workspace,
  });
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
  const reviewId = params.get('review');
  let project: VideoProject | undefined;
  let recordingId = rootRecordingId;

  if (projectId) {
    project = await openPersistedProject(projectId);
  }

  if (!project && reviewId !== null) {
    const revisionInput = params.get('reviewRevision');
    const createdInput = params.get('reviewCreatedAt');
    const sourceAssetId = params.get('reviewSourceAssetId');
    const revision =
      revisionInput !== null && /^\d+$/.test(revisionInput) ? Number(revisionInput) : NaN;
    const createdAt =
      createdInput !== null && /^\d+$/.test(createdInput) ? Number(createdInput) : NaN;
    if (
      !reviewId ||
      reviewId.length > 256 ||
      !sourceAssetId ||
      sourceAssetId.length > 256 ||
      !Number.isSafeInteger(revision) ||
      !Number.isSafeInteger(createdAt)
    )
      throw new Error('Review project transfer target is invalid.');
    project = await createProjectFromReview(reviewId, revision, createdAt, sourceAssetId);
    recordingId = project.baseRecordingId;
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
