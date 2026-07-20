import {
  resolveEffectV1InputContract,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';

import { isImageBitmap } from '../../contracts/effect-runtime/bitmap-lifetime';
import { hasExactKeys, isRecord } from '../../contracts/effect-runtime/identity';
import type {
  EffectRuntimeFrameInput,
  EffectRuntimeFrameInputs,
  EffectRuntimeRenderRequest,
} from '../../contracts/effect-runtime/types';
import { assertEffectDecodedRaster } from '../../features/video/composition/effect-runtime/runtime/resource-limits';

const INPUT_KEYS = ['bitmap', 'height', 'width'] as const;
const MAX_CONTROL_STRING_LENGTH = 4_096;

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
  document: EffectV1Document
): Record<string, number | string> | null {
  if (!isRecord(value)) return null;
  const definitions = new Map(document.controls.map((control) => [control.id, control]));
  if (!hasExactKeys(value, [...definitions.keys()])) return null;
  const controls: Record<string, number | string> = {};
  for (const [id, definition] of definitions) {
    const control = value[id];
    if (!isValidControlValue(control, definition)) return null;
    controls[id] = control;
  }
  return controls;
}

function isValidControlValue(
  value: unknown,
  definition: EffectV1Document['controls'][number]
): value is number | string {
  if (definition.kind !== 'number') {
    return typeof value === 'string' && value.length <= MAX_CONTROL_STRING_LENGTH;
  }
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (definition.min === undefined || value >= definition.min) &&
    (definition.max === undefined || value <= definition.max)
  );
}

export function parseInputFrames(
  value: unknown,
  document: EffectV1Document,
  dimensions: { height: number; width: number } | null
): EffectRuntimeFrameInputs | null {
  if (!dimensions || !isRecord(value)) return null;
  const contract = resolveEffectV1InputContract(document.kind);
  if (!hasExactKeys(value, contract.required)) return null;
  const result: EffectRuntimeFrameInputs = {};
  for (const name of contract.required) {
    const input = parseFrameInput(value[name], dimensions);
    if (!input) return null;
    result[name] = input;
  }
  const bitmaps = Object.values(result).map(({ bitmap }) => bitmap);
  return new Set(bitmaps).size === bitmaps.length ? result : null;
}

function parseFrameInput(
  value: unknown,
  dimensions: { height: number; width: number }
): EffectRuntimeFrameInput | null {
  if (!isRecord(value) || !hasExactKeys(value, INPUT_KEYS) || !isImageBitmap(value['bitmap'])) {
    return null;
  }
  if (
    value['width'] !== dimensions.width ||
    value['height'] !== dimensions.height ||
    value['bitmap'].width !== dimensions.width ||
    value['bitmap'].height !== dimensions.height
  ) {
    return null;
  }
  return { bitmap: value['bitmap'], height: dimensions.height, width: dimensions.width };
}
