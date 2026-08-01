import {
  isVideoPixelRateSupported,
  isVideoResolutionFrameRateSupported,
  resolveVideoPixelRate,
  type VideoFrameRate,
  type VideoOutputDimensions,
  type VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';

interface RecordingResourceBudgetInput {
  dimensions: readonly VideoOutputDimensions[];
  frameRate: VideoFrameRate;
  resolution: VideoResolutionPreset;
}

export function resolveAggregateRecordingPixelRate(
  input: Pick<RecordingResourceBudgetInput, 'dimensions' | 'frameRate'>
): number {
  if (input.dimensions.length === 0) {
    throw new Error('Recording resource validation requires at least one video artifact.');
  }
  return input.dimensions.reduce(
    (total, dimensions) => total + resolveVideoPixelRate(dimensions, input.frameRate),
    0
  );
}

export function assertRecordingResourceBudget(input: RecordingResourceBudgetInput): void {
  if (!isVideoResolutionFrameRateSupported(input.resolution, input.frameRate)) {
    throw new Error('The selected output frame rate is unsupported for its resolution.');
  }
  const totalPixelRate = resolveAggregateRecordingPixelRate(input);
  if (!isVideoPixelRateSupported(totalPixelRate)) {
    throw new Error('The selected recording sources exceed the supported live encoding budget.');
  }
}
