import {
  resolveVideoOutputDimensions,
  type VideoFrameRate,
  type VideoOutputDimensions,
  type VideoResolutionPreset,
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
  resolution: VideoResolutionPreset;
  sourceRect: RecordingSampleRect;
};

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
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
  if (!Number.isFinite(x) || !Number.isInteger(x) || x < 0) {
    throw new Error('Recording sample x must be a non-negative integer');
  }
  if (!Number.isFinite(y) || !Number.isInteger(y) || y < 0) {
    throw new Error('Recording sample y must be a non-negative integer');
  }
  return Object.freeze({
    height: requirePositiveInteger(sourceRect.height, 'Recording sample height'),
    width: requirePositiveInteger(sourceRect.width, 'Recording sample width'),
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

export function createRecordingGeometryPlan(
  input: RecordingGeometryPlanInput
): RecordingGeometryPlan {
  const outputBasis = freezeSize(input.outputBasis, 'Recording output basis');
  const outputSize = freezeSize(
    resolveVideoOutputDimensions(outputBasis.width, outputBasis.height, input.resolution),
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
