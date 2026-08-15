import type { ViewportPreset } from '../../../contracts/settings';
import {
  isVideoPixelRateSupported,
  isVideoResolutionFrameRateSupported,
  resolveVideoOutputDimensions,
  resolveVideoPixelRate,
  type VideoOutputDimensions,
  type VideoOutputProfile,
  type CaptureMode,
} from '@sniptale/runtime-contracts/video/types/types';

export function resolveKnownVideoOutputBasis(
  captureMode: CaptureMode,
  selectedPreset: ViewportPreset | null
): VideoOutputDimensions | null {
  void captureMode;
  void selectedPreset;
  return null;
}

export function isKnownVideoOutputProfileSupported(
  source: VideoOutputDimensions | null,
  outputProfile: VideoOutputProfile
): boolean {
  if (!isVideoResolutionFrameRateSupported(outputProfile.resolution, outputProfile.frameRate)) {
    return false;
  }
  if (!source) return true;
  const dimensions = resolveVideoOutputDimensions(
    source.width,
    source.height,
    outputProfile.resolution
  );
  return isVideoPixelRateSupported(resolveVideoPixelRate(dimensions, outputProfile.frameRate));
}
