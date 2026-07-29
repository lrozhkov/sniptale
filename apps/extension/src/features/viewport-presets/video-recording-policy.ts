import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

import type { ViewportPreset } from './contracts';

type VideoViewportPreset = Pick<ViewportPreset, 'id' | 'target'>;

export function isViewportPresetAllowedForVideoCaptureMode(
  captureMode: CaptureMode,
  preset: Pick<VideoViewportPreset, 'target'>
): boolean {
  return captureMode !== CaptureMode.TAB_CROP || preset.target !== 'viewport';
}

export function resolveVideoViewportPresetId(
  captureMode: CaptureMode,
  presets: readonly VideoViewportPreset[],
  presetId: string | null
): string | null {
  if (!presetId) return null;
  const preset = presets.find((candidate) => candidate.id === presetId);
  return preset && isViewportPresetAllowedForVideoCaptureMode(captureMode, preset)
    ? preset.id
    : null;
}
