import { normalizeClipPlaybackRate } from '../../../features/video/project/timeline/basics';
import { mapSourceTimeToProjectPoint } from '../../../features/video/project/timeline/source-time';
import type { VideoProjectSourceTimeAnchor } from '../../../features/video/project/types/interaction';
import type {
  VideoProjectAudioClip,
  VideoProjectVideoClip,
} from '../../../features/video/project/types/model';

export type SourceTimedClip = VideoProjectVideoClip | VideoProjectAudioClip;

interface AnchorProjection {
  anchor: VideoProjectSourceTimeAnchor;
  time: number;
  timeScale: number;
}

const SOURCE_SPLIT_BOUNDARY_EPSILON = 0.000_001;

export function projectSourceTimeAnchor(
  anchor: VideoProjectSourceTimeAnchor,
  recordingId: string,
  previousClips: SourceTimedClip[],
  nextClips: SourceTimedClip[],
  splitLineage?: ReadonlyMap<string, string>
): AnchorProjection | null {
  if (anchor.recordingId !== recordingId) {
    return null;
  }

  const previousClip = previousClips.find((clip) => clip.id === anchor.sourceClipId);
  if (!previousClip) {
    return null;
  }

  const trailingSplitClips = nextClips.filter(
    (clip) =>
      clip.id === splitLineage?.get(previousClip.id) &&
      clip.assetId === previousClip.assetId &&
      Math.abs(clip.sourceStart - anchor.sourceTime) <= SOURCE_SPLIT_BOUNDARY_EPSILON
  );
  let point = mapSourceTimeToProjectPoint(trailingSplitClips, anchor.sourceTime);
  point ??= mapSourceTimeToProjectPoint(
    nextClips.filter((clip) => clip.id === anchor.sourceClipId),
    anchor.sourceTime,
    anchor.sourceClipId
  );
  if (!point) {
    const sourceClipStillExists = nextClips.some((clip) => clip.id === anchor.sourceClipId);
    if (!sourceClipStillExists) {
      return null;
    }

    point = mapSourceTimeToProjectPoint(
      nextClips.filter(
        (clip) =>
          clip.id === splitLineage?.get(previousClip.id) && clip.assetId === previousClip.assetId
      ),
      anchor.sourceTime
    );
  }
  if (!point) {
    return null;
  }

  const nextClip = nextClips.find((clip) => clip.id === point.clipId);
  if (!nextClip) {
    return null;
  }

  return {
    anchor: { ...anchor, sourceClipId: point.clipId },
    time: point.time,
    timeScale:
      normalizeClipPlaybackRate(previousClip.playbackRate ?? 1) /
      normalizeClipPlaybackRate(nextClip.playbackRate ?? 1),
  };
}
