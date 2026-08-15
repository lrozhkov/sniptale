import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

import type { ViewportPreset } from './contracts';

type VideoViewportPreset = Pick<ViewportPreset, 'id' | 'target'>;

export function isViewportPresetAllowedForVideoCaptureMode(
  _captureMode: CaptureMode,
  _preset: Pick<VideoViewportPreset, 'target'>
): boolean {
  return true;
}

export function resolveVideoViewportPresetId(
  _captureMode: CaptureMode,
  presets: readonly VideoViewportPreset[],
  presetId: string | null
): string | null {
  if (!presetId) return null;
  const preset = presets.find((candidate) => candidate.id === presetId);
  return preset?.id ?? null;
}
