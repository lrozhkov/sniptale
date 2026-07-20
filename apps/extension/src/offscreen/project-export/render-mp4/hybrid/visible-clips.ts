import type { VideoCompositionTimelineIndex } from '../../../../features/video/composition/timeline/frame/index';
import {
  isAudioClip,
  isClipActiveAtTime,
  isVideoClip,
} from '../../../../features/video/project/timeline/basics';
import {
  type VideoProjectClip,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types/model';

function getVisibleClipsAtTime(
  timelineIndex: VideoCompositionTimelineIndex,
  currentTime: number
): VideoProjectClip[] {
  const result: VideoProjectClip[] = [];
  for (const track of timelineIndex.tracksInRenderOrder) {
    if (!track.visible) {
      continue;
    }

    for (const clip of timelineIndex.clipsByTrackId.get(track.id) ?? []) {
      if (isClipActiveAtTime(clip, currentTime)) {
        result.push(clip);
      }
    }
  }
  return result;
}

export function getSingleVisibleVideoClip(
  timelineIndex: VideoCompositionTimelineIndex,
  time: number
): VideoProjectVideoClip | null {
  let visibleClip: VideoProjectVideoClip | null = null;
  let visibleClipCount = 0;
  for (const clipCandidate of getVisibleClipsAtTime(timelineIndex, time)) {
    if (isAudioClip(clipCandidate)) {
      continue;
    }
    visibleClipCount += 1;
    if (isVideoClip(clipCandidate)) {
      visibleClip = clipCandidate;
    }
  }
  return visibleClipCount === 1 ? visibleClip : null;
}
