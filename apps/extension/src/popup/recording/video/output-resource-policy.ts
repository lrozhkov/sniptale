import type { ViewportPreset } from '../../../contracts/settings';
import {
  CaptureMode,
  isVideoPixelRateSupported,
  isVideoResolutionFrameRateSupported,
  resolveVideoOutputDimensions,
  resolveVideoPixelRate,
  type VideoOutputDimensions,
  type VideoOutputProfile,
} from '@sniptale/runtime-contracts/video/types/types';

export function resolveKnownVideoOutputBasis(
  captureMode: CaptureMode,
  selectedPreset: ViewportPreset | null
): VideoOutputDimensions | null {
  if (
    captureMode !== CaptureMode.TAB ||
    selectedPreset?.target !== 'viewport' ||
    !selectedPreset.enabled
  ) {
    return null;
  }
  return { height: selectedPreset.height, width: selectedPreset.width };
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
