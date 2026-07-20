import { clampNumber } from '../timeline/basics';
import type {
  VideoProjectClip,
  VideoProjectTransitionSegment,
  VideoTemplateDirection,
  VideoTemplateIntensity,
  VideoTransitionEasing,
} from '../types/index';

const TRANSITION_INTENSITY_MULTIPLIER = {
  SOFT: 0.72,
  BALANCED: 1,
  BOLD: 1.32,
} as const satisfies Record<VideoTemplateIntensity, number>;

export function getTransitionIntensityMultiplier(intensity: VideoTemplateIntensity): number {
  return TRANSITION_INTENSITY_MULTIPLIER[intensity];
}

export function getTransitionProgress(
  segment: VideoProjectTransitionSegment,
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

export function getIncomingOffset(
  direction: VideoTemplateDirection,
  distance: number
): { x: number; y: number } {
  switch (direction) {
    case 'LEFT':
      return { x: distance, y: 0 };
    case 'RIGHT':
      return { x: -distance, y: 0 };
    case 'UP':
      return { x: 0, y: distance };
    case 'DOWN':
      return { x: 0, y: -distance };
  }
}

export function resolveDirectionalDistance(
  clip: VideoProjectClip,
  direction: VideoTemplateDirection,
  multiplier: number
): number {
  const axisSize =
    direction === 'LEFT' || direction === 'RIGHT' ? clip.transform.width : clip.transform.height;
  return Math.max(axisSize * multiplier, 1);
}

function applyTransitionEasing(progress: number, easing: VideoTransitionEasing): number {
  switch (easing) {
    case 'LINEAR':
      return progress;
    case 'EASE_IN_OUT':
      return progress < 0.5 ? 4 * progress * progress * progress : 1 - (-2 * progress + 2) ** 3 / 2;
  }
}
