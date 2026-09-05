import type { VideoProjectEffectInstance } from './types';

const EFFECT_INSTANCE_TIMING_EPSILON = 1e-7;

export function isEffectInstanceTimingEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= EFFECT_INSTANCE_TIMING_EPSILON;
}

interface EffectInstanceTime {
  effectTime: number;
  progress: number;
}

/** Validates the retained document interval without requiring a whole-document instance. */
export function isEffectInstanceSourceRangeValid(
  instance: Pick<VideoProjectEffectInstance, 'duration' | 'playbackRate' | 'sourceStart' | 'kind'>,
  documentDuration: number
): boolean {
  const sourceStart = instance.sourceStart ?? 0;
  const sourceEnd = sourceStart + instance.duration * instance.playbackRate;
  return (
    Number.isFinite(documentDuration) &&
    documentDuration > 0 &&
    Number.isFinite(sourceStart) &&
    sourceStart >= 0 &&
    Number.isFinite(instance.duration) &&
    instance.duration > 0 &&
    Number.isFinite(instance.playbackRate) &&
    instance.playbackRate > 0 &&
    Number.isFinite(sourceEnd) &&
    sourceEnd <= documentDuration + EFFECT_INSTANCE_TIMING_EPSILON &&
    (instance.kind !== 'transition' ||
      (sourceStart === 0 && isEffectInstanceTimingEqual(sourceEnd, documentDuration)))
  );
}

export function resolveEffectInstanceTime(
  instance: Pick<
    VideoProjectEffectInstance,
    'duration' | 'playbackRate' | 'startTime' | 'sourceStart'
  >,
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
    Math.max(
      0,
      (instance.sourceStart ?? 0) + (projectTime - instance.startTime) * instance.playbackRate
    )
  );
  return { effectTime, progress: effectTime / documentDuration };
}
