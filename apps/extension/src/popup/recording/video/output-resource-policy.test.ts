import { expect, it } from 'vitest';
import {
  CaptureMode,
  DEFAULT_VIDEO_OUTPUT_PROFILE,
  VideoFrameRate,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  isKnownVideoOutputProfileSupported,
  resolveKnownVideoOutputBasis,
} from './output-resource-policy';

const viewportPreset = {
  enabled: true,
  height: 900,
  id: 'viewport-1440-900',
  kind: 'user' as const,
  name: '1440 × 900',
  order: 0,
  target: 'window' as const,
  width: 1440,
};

it('does not infer source geometry from browser-window dimensions', () => {
  expect(resolveKnownVideoOutputBasis(CaptureMode.TAB, viewportPreset)).toBeNull();
  expect(resolveKnownVideoOutputBasis(CaptureMode.TAB_CROP, viewportPreset)).toBeNull();
  expect(resolveKnownVideoOutputBasis(CaptureMode.SCREEN, viewportPreset)).toBeNull();
});

it('rejects a known 2160p60 output through the shared live pixel-rate policy', () => {
  const basis = { height: 900, width: 1440 };

  expect(
    isKnownVideoOutputProfileSupported(basis, {
      ...DEFAULT_VIDEO_OUTPUT_PROFILE,
      frameRate: VideoFrameRate.FPS60,
      resolution: VideoResolutionPreset.P2160,
    })
  ).toBe(false);
  expect(
    isKnownVideoOutputProfileSupported(basis, {
      ...DEFAULT_VIDEO_OUTPUT_PROFILE,
      frameRate: VideoFrameRate.FPS60,
      resolution: VideoResolutionPreset.P1080,
    })
  ).toBe(true);
});

it('enforces fixed-preset frame-rate compatibility even when chooser dimensions are unknown', () => {
  expect(
    isKnownVideoOutputProfileSupported(null, {
      ...DEFAULT_VIDEO_OUTPUT_PROFILE,
      frameRate: VideoFrameRate.FPS60,
      resolution: VideoResolutionPreset.P2160,
    })
  ).toBe(false);
});
