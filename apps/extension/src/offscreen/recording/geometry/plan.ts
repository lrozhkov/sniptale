import {
  resolveVideoOutputDimensions,
  VideoResolutionPreset,
  type VideoFrameRate,
  type VideoOutputDimensions,
  type VideoResolutionPreset as VideoResolutionPresetValue,
} from '@sniptale/runtime-contracts/video/types/types';

export type RecordingPixelSize = Readonly<VideoOutputDimensions>;

export type RecordingSampleRect = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type RecordingGeometryPlan = Readonly<{
  fit: 'contain';
  frameRateCap: VideoFrameRate;
  outputBasis: RecordingPixelSize;
  outputSize: RecordingPixelSize;
  sourceRect: RecordingSampleRect;
}>;

type RecordingGeometryPlanInput = {
  frameRateCap: VideoFrameRate;
  outputBasis: RecordingPixelSize;
  presetScaleMode?: 'allow-upscale' | 'avoid-upscale';
  resolution: VideoResolutionPresetValue;
  sourceRect: RecordingSampleRect;
};

const RECORDING_PRESET_HEIGHTS: Readonly<
  Record<Exclude<VideoResolutionPresetValue, 'SOURCE'>, number>
> = {
  [VideoResolutionPreset.P240]: 240,
  [VideoResolutionPreset.P360]: 360,
  [VideoResolutionPreset.P480]: 480,
  [VideoResolutionPreset.P720]: 720,
  [VideoResolutionPreset.P1080]: 1080,
  [VideoResolutionPreset.P1440]: 1440,
  [VideoResolutionPreset.P2160]: 2160,
};

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function requirePositiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive and finite`);
  }
  return value;
}

function freezeSize(size: RecordingPixelSize, label: string): RecordingPixelSize {
  return Object.freeze({
    height: requirePositiveInteger(size.height, `${label} height`),
    width: requirePositiveInteger(size.width, `${label} width`),
  });
}

function freezeSourceRect(sourceRect: RecordingSampleRect): RecordingSampleRect {
  const x = sourceRect.x;
  const y = sourceRect.y;
  if (!Number.isFinite(x) || x < 0) {
    throw new Error('Recording sample x must be non-negative and finite');
  }
  if (!Number.isFinite(y) || y < 0) {
    throw new Error('Recording sample y must be non-negative and finite');
  }
  return Object.freeze({
    height: requirePositiveFinite(sourceRect.height, 'Recording sample height'),
    width: requirePositiveFinite(sourceRect.width, 'Recording sample width'),
    x,
    y,
  });
}

function resolveEncoderSafeSampleRect(
  outputBasis: RecordingPixelSize,
  outputSize: RecordingPixelSize,
  sourceRect: RecordingSampleRect
): RecordingSampleRect {
  const sharesBasisPixels =
    sourceRect.width === outputBasis.width && sourceRect.height === outputBasis.height;
  if (!sharesBasisPixels) return sourceRect;

  const widthDelta = sourceRect.width - outputSize.width;
  const heightDelta = sourceRect.height - outputSize.height;
  if (widthDelta < 0 || widthDelta > 1 || heightDelta < 0 || heightDelta > 1) {
    return sourceRect;
  }
  return {
    ...sourceRect,
    height: outputSize.height,
    width: outputSize.width,
  };
}

function freezePlan(plan: RecordingGeometryPlan): RecordingGeometryPlan {
  return Object.freeze(plan);
}

function resolveRecordingOutputSize(
  outputBasis: RecordingPixelSize,
  resolution: VideoResolutionPresetValue,
  presetScaleMode: RecordingGeometryPlanInput['presetScaleMode']
): RecordingPixelSize {
  if (resolution !== VideoResolutionPreset.SOURCE && presetScaleMode === 'avoid-upscale') {
    const presetHeight = RECORDING_PRESET_HEIGHTS[resolution];
    if (outputBasis.height <= presetHeight) {
      return resolveVideoOutputDimensions(
        outputBasis.width,
        outputBasis.height,
        VideoResolutionPreset.SOURCE
      );
    }
  }
  return resolveVideoOutputDimensions(outputBasis.width, outputBasis.height, resolution);
}

export function createRecordingGeometryPlan(
  input: RecordingGeometryPlanInput
): RecordingGeometryPlan {
  const outputBasis = freezeSize(input.outputBasis, 'Recording output basis');
  const outputSize = freezeSize(
    resolveRecordingOutputSize(outputBasis, input.resolution, input.presetScaleMode),
    'Recording output canvas'
  );
  const sourceRect = freezeSourceRect(
    resolveEncoderSafeSampleRect(outputBasis, outputSize, input.sourceRect)
  );

  return freezePlan({
    fit: 'contain',
    frameRateCap: input.frameRateCap,
    outputBasis,
    outputSize,
    sourceRect,
  });
}

export function remapRecordingGeometryPlan(
  plan: RecordingGeometryPlan,
  sourceRect: RecordingSampleRect
): RecordingGeometryPlan {
  return freezePlan({
    fit: 'contain',
    frameRateCap: plan.frameRateCap,
    outputBasis: plan.outputBasis,
    outputSize: plan.outputSize,
    sourceRect: freezeSourceRect(
      resolveEncoderSafeSampleRect(plan.outputBasis, plan.outputSize, sourceRect)
    ),
  });
}
