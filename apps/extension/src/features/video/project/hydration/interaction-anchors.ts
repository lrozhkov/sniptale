import { mapSourceTimeToProjectPoint } from '../timeline/source-time';
import type { VideoProject, VideoProjectSourceTimeAnchor } from '../types/index';
import { VideoProjectClipType, VideoProjectInteractionTimeBasis } from '../types/index';

function isRecordingAsset(project: VideoProject, assetId: string, recordingId: string): boolean {
  const asset = project.assets.find((item) => item.id === assetId);
  return Boolean(
    asset &&
    ((asset.source.kind === 'recording' && asset.source.recordingId === recordingId) ||
      (asset.source.kind === 'project-asset' && asset.source.originRecordingId === recordingId))
  );
}

function resolveSourceAnchorTime(
  anchor: VideoProjectSourceTimeAnchor,
  project: VideoProject
): number | null {
  const clip = project.clips.find((item) => item.id === anchor.sourceClipId);
  if (
    !clip ||
    clip.type !== VideoProjectClipType.VIDEO ||
    !isRecordingAsset(project, clip.assetId, anchor.recordingId)
  )
    return null;
  return mapSourceTimeToProjectPoint([clip], anchor.sourceTime, anchor.sourceClipId)?.time ?? null;
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

export function hydrateRecordingInteractionAnchors(project: VideoProject): VideoProject {
  return {
    ...project,
    cursorTrack: project.cursorTrack
      ? {
          ...project.cursorTrack,
          samples: project.cursorTrack.samples.map((sample) => {
            if (sample.timeBasis === VideoProjectInteractionTimeBasis.PROJECT) {
              return sample.sourceAnchor ? withoutSourceAnchor(sample) : sample;
            }
            if (sample.sourceAnchor) {
              const time = resolveSourceAnchorTime(sample.sourceAnchor, project);
              return time === null ? withoutSourceAnchor(sample) : { ...sample, time };
            }
            return sample;
          }),
        }
      : null,
  };
}
