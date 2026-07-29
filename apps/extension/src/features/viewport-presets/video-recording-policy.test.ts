import { describe, expect, it } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

import {
  isViewportPresetAllowedForVideoCaptureMode,
  resolveVideoViewportPresetId,
} from './video-recording-policy';

const viewportPreset = {
  kind: 'user' as const,
  id: 'viewport-1',
  name: 'Viewport',
  target: 'viewport' as const,
  width: 1280,
  height: 720,
  enabled: true,
  order: 0,
};

const windowPreset = {
  ...viewportPreset,
  id: 'window-1',
  name: 'Window',
  target: 'window' as const,
};

describe('video viewport-preset policy', () => {
  it('disallows viewport targets only for TAB_CROP recording', () => {
    expect(isViewportPresetAllowedForVideoCaptureMode(CaptureMode.TAB_CROP, viewportPreset)).toBe(
      false
    );
    expect(isViewportPresetAllowedForVideoCaptureMode(CaptureMode.TAB_CROP, windowPreset)).toBe(
      true
    );
    expect(isViewportPresetAllowedForVideoCaptureMode(CaptureMode.TAB, viewportPreset)).toBe(true);
  });

  it('normalizes missing and mode-incompatible selections to current size', () => {
    const presets = [viewportPreset, windowPreset];

    expect(
      resolveVideoViewportPresetId(CaptureMode.TAB_CROP, presets, viewportPreset.id)
    ).toBeNull();
    expect(resolveVideoViewportPresetId(CaptureMode.TAB_CROP, presets, windowPreset.id)).toBe(
      windowPreset.id
    );
    expect(resolveVideoViewportPresetId(CaptureMode.TAB, presets, 'missing')).toBeNull();
  });
});
