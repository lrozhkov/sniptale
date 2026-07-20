import type { VideoProjectEffectInstance } from './types';

const EFFECT_INSTANCE_TIMING_EPSILON = 1e-7;

export function isEffectInstanceTimingEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= EFFECT_INSTANCE_TIMING_EPSILON;
}

interface EffectInstanceTime {
  effectTime: number;
  progress: number;
}

export function resolveEffectInstanceTime(
  instance: Pick<VideoProjectEffectInstance, 'duration' | 'playbackRate' | 'startTime'>,
  documentDuration: number,
  projectTime: number
): EffectInstanceTime | null {
  if (
    !Number.isFinite(projectTime) ||
    !Number.isFinite(documentDuration) ||
    documentDuration <= 0 ||
    instance.duration <= 0 ||
    instance.playbackRate <= 0 ||
    projectTime < instance.startTime ||
    projectTime >= instance.startTime + instance.duration
  ) {
    return null;
  }
  const effectTime = Math.min(
    documentDuration,
    Math.max(0, (projectTime - instance.startTime) * instance.playbackRate)
  );
  return { effectTime, progress: effectTime / documentDuration };
}
