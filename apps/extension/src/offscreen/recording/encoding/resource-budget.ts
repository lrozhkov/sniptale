import {
  isVideoPixelRateSupported,
  isVideoResolutionFrameRateSupported,
  type VideoFrameRate,
  type VideoOutputDimensions,
  type VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';

interface RecordingResourceBudgetInput {
  artifacts: ReadonlyArray<{
    dimensions: VideoOutputDimensions;
    frameRate: number;
  }>;
  frameRate: VideoFrameRate;
  resolution: VideoResolutionPreset;
}

function resolveArtifactPixelRate(artifact: RecordingResourceBudgetInput['artifacts'][number]) {
  const { height, width } = artifact.dimensions;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error('Video output dimensions must be positive integers');
  }
  if (!Number.isFinite(artifact.frameRate) || artifact.frameRate <= 0) {
    throw new Error('Video output frame rate must be positive');
  }
  return width * height * artifact.frameRate;
}

export function resolveAggregateRecordingPixelRate(
  input: Pick<RecordingResourceBudgetInput, 'artifacts'>
): number {
  if (input.artifacts.length === 0) {
    throw new Error('Recording resource validation requires at least one video artifact.');
  }
  return input.artifacts.reduce((total, artifact) => total + resolveArtifactPixelRate(artifact), 0);
}

export function assertRecordingResourceBudget(input: RecordingResourceBudgetInput): void {
  if (!isVideoResolutionFrameRateSupported(input.resolution, input.frameRate)) {
    throw new Error('The selected output frame rate is unsupported for its resolution.');
  }
  resolveAggregateRecordingPixelRate(input);
  if (
    input.artifacts.some(
      (artifact) => !isVideoPixelRateSupported(resolveArtifactPixelRate(artifact))
    )
  ) {
    throw new Error('A selected recording source exceeds its encoder resource budget.');
  }
}
