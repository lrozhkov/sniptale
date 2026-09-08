import type { VideoProjectMotionRegion } from '../types/interaction';

/** Checks the authored animation interval used by split zoom regions. */
export function isMotionAnimation(
  value: unknown
): value is NonNullable<VideoProjectMotionRegion['animation']> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'start' in value &&
    typeof value.start === 'number' &&
    Number.isFinite(value.start) &&
    value.start >= 0 &&
    'end' in value &&
    typeof value.end === 'number' &&
    Number.isFinite(value.end) &&
    value.end > value.start &&
    'duration' in value &&
    typeof value.duration === 'number' &&
    Number.isFinite(value.duration) &&
    value.duration >= value.end
  );
}

/** Maps an offset within the visible region to its retained animation clock. */
export function getMotionAnimationTime(region: VideoProjectMotionRegion, offset: number): number {
  const animation = region.animation;
  return animation && region.duration > 0
    ? animation.start + (offset / region.duration) * (animation.end - animation.start)
    : offset;
}
