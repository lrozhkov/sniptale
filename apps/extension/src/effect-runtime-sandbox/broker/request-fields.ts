import type { AnimationTemplate } from '@sniptale/runtime-contracts/animation-template';
import { parseEffectControlValues } from '@sniptale/runtime-contracts/effect-controls';
import { hasExactKeys, isRecord } from '../../contracts/effect-runtime/identity';
import type {
  EffectRuntimeFrameInputs,
  EffectRuntimeRenderRequest,
} from '../../contracts/effect-runtime/types';
import { assertEffectDecodedRaster } from '../../features/video/composition/effect-runtime/runtime/resource-limits';

export function parseRenderDimensions(
  width: unknown,
  height: unknown,
  logicalDimensions: { height: number; width: number } | null
): { height: number; width: number } | null {
  const dimensions = parseFrameDimensions(width, height);
  if (!dimensions || !logicalDimensions) {
    return null;
  }
  return dimensions;
}

export function parseFrameDimensions(
  width: unknown,
  height: unknown
): { height: number; width: number } | null {
  try {
    assertEffectDecodedRaster(width, height);
    return { height: height as number, width: width as number };
  } catch {
    return null;
  }
}

export function parseTiming(
  value: Record<string, unknown>,
  documentDuration: number
): Pick<
  EffectRuntimeRenderRequest,
  'duration' | 'fps' | 'frameIndex' | 'progress' | 'time'
> | null {
  const duration = value['duration'];
  const fps = value['fps'];
  const frameIndex = value['frameIndex'];
  const progress = value['progress'];
  const time = value['time'];
  const timing = { documentDuration, duration, fps, frameIndex, progress, time };
  if (!hasValidTiming(timing)) return null;
  return {
    duration: timing.duration,
    fps: timing.fps,
    frameIndex: timing.frameIndex,
    progress: timing.progress,
    time: timing.time,
  };
}

function hasValidTiming(values: {
  documentDuration: number;
  duration: unknown;
  fps: unknown;
  frameIndex: unknown;
  progress: unknown;
  time: unknown;
}): values is {
  documentDuration: number;
  duration: number;
  fps: number;
  frameIndex: number;
  progress: number;
  time: number;
} {
  return (
    typeof values.duration === 'number' &&
    values.duration === values.documentDuration &&
    typeof values.fps === 'number' &&
    Number.isFinite(values.fps) &&
    values.fps > 0 &&
    values.fps <= 240 &&
    typeof values.frameIndex === 'number' &&
    Number.isSafeInteger(values.frameIndex) &&
    values.frameIndex >= 0 &&
    typeof values.time === 'number' &&
    Number.isFinite(values.time) &&
    values.time >= 0 &&
    values.time <= values.duration &&
    typeof values.progress === 'number' &&
    Number.isFinite(values.progress) &&
    values.progress >= 0 &&
    values.progress <= 1 &&
    Math.abs(values.progress - values.time / values.duration) <= 1e-7
  );
}

export function parseControls(
  value: unknown,
  document: AnimationTemplate
): Record<string, number | string> | null {
  return parseEffectControlValues(document, value);
}

export function parseInputFrames(
  value: unknown,
  _document: AnimationTemplate,
  dimensions: { height: number; width: number } | null
): EffectRuntimeFrameInputs | null {
  return dimensions && isRecord(value) && hasExactKeys(value, []) ? {} : null;
}
