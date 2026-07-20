import { createSha256Digest } from '@sniptale/platform/security/digest';

import { getVideoCompositionActionDuration } from '../../../features/video/composition/timeline/frame/actions';
import type { VideoProject } from '../../../features/video/project/types';

interface VideoPreviewSegmentRange {
  endFrame: number;
  startFrame: number;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  if (value instanceof Blob) return { byteLength: value.size, mimeType: value.type };
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry !== undefined) result[key] = canonicalize(entry);
  }
  return result;
}

function projectVideoPreviewRenderState(project: VideoProject): unknown {
  const { createdAt: _createdAt, name: _name, updatedAt: _updatedAt, ...renderState } = project;
  return {
    ...renderState,
    assets: project.assets.map(({ createdAt, metadata, name: _assetName, ...asset }) => ({
      ...asset,
      createdAt,
      metadata: {
        duration: metadata.duration,
        hasAudio: metadata.hasAudio,
        height: metadata.height,
        mimeType: metadata.mimeType,
        size: metadata.size,
        width: metadata.width,
      },
    })),
    clips: project.clips.map(({ name: _clipName, ...clip }) => clip),
    effectSnapshots: project.effectSnapshots?.map((snapshot) => ({
      assets: snapshot.assets.map(({ id, kind, mimeType, sha256 }) => ({
        id,
        kind,
        mimeType,
        sha256,
      })),
      documentId: snapshot.documentId,
      id: snapshot.id,
      kind: snapshot.kind,
      schemaVersion: snapshot.schemaVersion,
      sha256: snapshot.sha256,
    })),
    tracks: project.tracks.map(({ name: _trackName, ...track }) => track),
  };
}

function overlapsRange(
  startTime: number,
  duration: number,
  rangeStart: number,
  rangeEnd: number
): boolean {
  return startTime < rangeEnd && startTime + Math.max(0, duration) > rangeStart;
}

function selectTemporalSamples<const Sample extends { time: number }>(
  samples: readonly Sample[],
  rangeStart: number,
  rangeEnd: number
): Sample[] {
  if (samples.length === 0) return [];
  const sorted = [...samples].sort((left, right) => left.time - right.time);
  let predecessor: Sample | null = null;
  let successor: Sample | null = null;
  const selected: Sample[] = [];
  for (const sample of sorted) {
    if (sample.time < rangeStart) predecessor = sample;
    else if (sample.time <= rangeEnd) selected.push(sample);
    else if (!successor) successor = sample;
  }
  return [...(predecessor ? [predecessor] : []), ...selected, ...(successor ? [successor] : [])];
}

function selectSegmentDependencies(project: VideoProject, rangeStart: number, rangeEnd: number) {
  const clips = project.clips.filter((clip) =>
    overlapsRange(clip.startTime, clip.duration, rangeStart, rangeEnd)
  );
  const clipIds = new Set(clips.map((clip) => clip.id));
  const transitions = (project.transitions ?? []).filter(
    (transition) => clipIds.has(transition.leadingClipId) || clipIds.has(transition.trailingClipId)
  );
  const transitionIds = new Set(transitions.map((transition) => transition.id));
  const effectInstances = (project.effectInstances ?? []).filter((instance) => {
    if (!overlapsRange(instance.startTime, instance.duration, rangeStart, rangeEnd)) return false;
    if (instance.target.kind === 'clip') return clipIds.has(instance.target.clipId);
    if (instance.target.kind === 'transition') {
      return transitionIds.has(instance.target.transitionId);
    }
    return true;
  });
  const assetIds = new Set<string>();
  for (const clip of clips) {
    if ('assetId' in clip) assetIds.add(clip.assetId);
    if (clip.type === 'SHAPE' && clip.embeddedAsset) assetIds.add(clip.embeddedAsset.assetId);
  }
  if (project.sceneBackground?.kind === 'image') assetIds.add(project.sceneBackground.assetId);
  return {
    assetIds,
    clipIds,
    effectInstances,
    snapshotIds: new Set(effectInstances.map((instance) => instance.snapshotId)),
    transitions,
  };
}

function selectSegmentActionEvents(
  project: VideoProject,
  motionRegions: NonNullable<VideoProject['motionRegions']>,
  rangeStart: number,
  rangeEnd: number
) {
  const targetedActionIds = new Set(
    motionRegions
      .map(({ targetActionEventId }) => targetActionEventId)
      .filter((id): id is string => typeof id === 'string')
  );
  return project.actionEvents.filter(
    (event) =>
      targetedActionIds.has(event.id) ||
      overlapsRange(event.time, getVideoCompositionActionDuration(event), rangeStart, rangeEnd)
  );
}

function projectVideoPreviewSegmentRenderState(
  project: VideoProject,
  range: VideoPreviewSegmentRange
): unknown {
  const rangeStart = range.startFrame / Math.max(1, project.fps);
  const rangeEnd = range.endFrame / Math.max(1, project.fps);
  const fullState = projectVideoPreviewRenderState(project) as Record<string, unknown>;
  const selected = selectSegmentDependencies(project, rangeStart, rangeEnd);
  const motionRegions = (project.motionRegions ?? []).filter((region) =>
    overlapsRange(region.startTime, region.duration, rangeStart, rangeEnd)
  );

  return {
    ...fullState,
    actionEvents: selectSegmentActionEvents(project, motionRegions, rangeStart, rangeEnd),
    assets: (fullState['assets'] as Array<{ id: string }>).filter((asset) =>
      selected.assetIds.has(asset.id)
    ),
    clips: (fullState['clips'] as Array<{ id: string }>).filter((clip) =>
      selected.clipIds.has(clip.id)
    ),
    cursorTrack: project.cursorTrack
      ? {
          ...project.cursorTrack,
          samples: selectTemporalSamples(project.cursorTrack.samples, rangeStart, rangeEnd),
        }
      : null,
    effectInstances: selected.effectInstances,
    effectSnapshots: (fullState['effectSnapshots'] as Array<{ id: string }> | undefined)?.filter(
      (snapshot) => selected.snapshotIds.has(snapshot.id)
    ),
    motionRegions,
    objectTracks: (project.objectTracks ?? []).map((track) => ({
      ...track,
      correctionAnchors: track.correctionAnchors
        ? selectTemporalSamples(track.correctionAnchors, rangeStart, rangeEnd)
        : undefined,
      samples: selectTemporalSamples(track.samples, rangeStart, rangeEnd),
    })),
    transitions: selected.transitions,
  };
}

export function createVideoPreviewRenderIdentity(project: VideoProject): string {
  return JSON.stringify(canonicalize(projectVideoPreviewRenderState(project)));
}

export async function createVideoPreviewRenderRevision(project: VideoProject): Promise<string> {
  return createSha256Digest(createVideoPreviewRenderIdentity(project));
}

export async function createVideoPreviewSegmentRevision(
  project: VideoProject,
  range: VideoPreviewSegmentRange
): Promise<string> {
  return createSha256Digest(
    JSON.stringify(canonicalize(projectVideoPreviewSegmentRenderState(project, range)))
  );
}
