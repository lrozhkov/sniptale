import { clampNumber } from '../timeline/basics';
import type { VideoProjectTransitionSegment, VideoTransitionEasing } from '../types';

export function getTransitionProgress(
  segment: Pick<VideoProjectTransitionSegment, 'start' | 'end'> & {
    transition: Pick<VideoProjectTransitionSegment['transition'], 'easing'>;
  },
  currentTime: number
): number | null {
  if (currentTime < segment.start || currentTime >= segment.end) {
    return null;
  }

  const rawProgress = clampNumber(
    (currentTime - segment.start) / Math.max(segment.end - segment.start, 0.0001),
    0,
    1
  );
  return applyTransitionEasing(rawProgress, segment.transition.easing);
}

function applyTransitionEasing(progress: number, easing: VideoTransitionEasing): number {
  switch (easing) {
    case 'LINEAR':
      return progress;
    case 'EASE_IN_OUT':
      return progress < 0.5 ? 4 * progress * progress * progress : 1 - (-2 * progress + 2) ** 3 / 2;
  }
}
