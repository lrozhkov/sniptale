import { mapProjectTimeToSourcePoint, mapSourceTimeToProjectPoint } from '../timeline/source-time';
import type {
  VideoProject,
  VideoProjectSourceTimeAnchor,
  VideoProjectVideoClip,
} from '../types/index';
import {
  VideoProjectActionEventKind,
  VideoProjectClipType,
  VideoProjectInteractionTimeBasis,
} from '../types/index';

function isRecordingAsset(project: VideoProject, assetId: string, recordingId: string): boolean {
  const asset = project.assets.find((item) => item.id === assetId);
  return Boolean(
    asset &&
    ((asset.source.kind === 'recording' && asset.source.recordingId === recordingId) ||
      (asset.source.kind === 'project-asset' && asset.source.originRecordingId === recordingId))
  );
}

function collectAnchorSourceClips(
  project: VideoProject,
  recordingId: string
): VideoProjectVideoClip[] {
  const trackOrder = new Map(project.tracks.map((track) => [track.id, track.order]));
  return project.clips
    .filter(
      (clip): clip is VideoProjectVideoClip =>
        clip.type === VideoProjectClipType.VIDEO &&
        isRecordingAsset(project, clip.assetId, recordingId)
    )
    .sort(
      (left, right) =>
        (trackOrder.get(left.trackId) ?? 0) - (trackOrder.get(right.trackId) ?? 0) ||
        left.startTime - right.startTime
    );
}

function createInferredAnchor(
  clips: VideoProjectVideoClip[],
  recordingId: string,
  projectTime: number
): VideoProjectSourceTimeAnchor | null {
  const point = mapProjectTimeToSourcePoint(clips, projectTime);
  return point
    ? {
        kind: 'recording-source',
        recordingId,
        sourceClipId: point.clipId,
        sourceTime: point.sourceTime,
      }
    : null;
}

function isRecordingDerivedActionKind(kind: VideoProjectActionEventKind): boolean {
  return (
    kind === VideoProjectActionEventKind.CLICK ||
    kind === VideoProjectActionEventKind.KEY ||
    kind === VideoProjectActionEventKind.SCROLL
  );
}

function resolveSourceAnchorTime(
  anchor: VideoProjectSourceTimeAnchor,
  clips: VideoProjectVideoClip[],
  recordingId: string
): number | null {
  if (anchor.recordingId !== recordingId) {
    return null;
  }
  return (
    mapSourceTimeToProjectPoint(
      clips.filter((clip) => clip.id === anchor.sourceClipId),
      anchor.sourceTime,
      anchor.sourceClipId
    )?.time ?? null
  );
}

function withoutSourceAnchor<T extends { sourceAnchor?: VideoProjectSourceTimeAnchor }>(
  value: T
): T {
  const nextValue = {
    ...value,
    timeBasis: VideoProjectInteractionTimeBasis.PROJECT,
  };
  delete nextValue.sourceAnchor;
  return nextValue;
}

export function hydrateRecordingInteractionAnchors(
  project: VideoProject,
  options: { inferMissing: boolean }
): VideoProject {
  const recordingId = project.baseRecordingId;
  if (!recordingId) {
    return project;
  }

  const clips = collectAnchorSourceClips(project, recordingId);
  return {
    ...project,
    actionEvents: project.actionEvents.map((event) => {
      if (event.timeBasis === VideoProjectInteractionTimeBasis.PROJECT) {
        return event.sourceAnchor ? withoutSourceAnchor(event) : event;
      }
      if (event.sourceAnchor) {
        const time = resolveSourceAnchorTime(event.sourceAnchor, clips, recordingId);
        return time === null ? withoutSourceAnchor(event) : { ...event, time };
      }
      if (!options.inferMissing || !isRecordingDerivedActionKind(event.kind)) {
        return options.inferMissing
          ? { ...event, timeBasis: VideoProjectInteractionTimeBasis.PROJECT }
          : event;
      }

      const sourceAnchor = createInferredAnchor(clips, recordingId, event.time);
      return sourceAnchor
        ? { ...event, sourceAnchor }
        : { ...event, timeBasis: VideoProjectInteractionTimeBasis.PROJECT };
    }),
    cursorTrack: project.cursorTrack
      ? {
          ...project.cursorTrack,
          samples: project.cursorTrack.samples.map((sample) => {
            if (sample.timeBasis === VideoProjectInteractionTimeBasis.PROJECT) {
              return sample.sourceAnchor ? withoutSourceAnchor(sample) : sample;
            }
            if (sample.sourceAnchor) {
              const time = resolveSourceAnchorTime(sample.sourceAnchor, clips, recordingId);
              return time === null ? withoutSourceAnchor(sample) : { ...sample, time };
            }
            if (!options.inferMissing) {
              return sample;
            }

            const sourceAnchor = createInferredAnchor(clips, recordingId, sample.time);
            return sourceAnchor
              ? { ...sample, sourceAnchor }
              : { ...sample, timeBasis: VideoProjectInteractionTimeBasis.PROJECT };
          }),
        }
      : null,
  };
}
