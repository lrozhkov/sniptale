import { expect, it } from 'vitest';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import { VideoExportQualityPreset } from '../../../features/video/project/types';
import { resolveExportTargetBitrate } from './bitrate';

function createSettings(overrides: Record<string, unknown> = {}) {
  return {
    fps: 30,
    height: 1080,
    quality: VideoExportQualityPreset.HIGH,
    resolution: VideoResolutionPreset.P1080,
    width: 1920,
    ...overrides,
  } as never;
}

it('uses materialized dimensions rather than the requested resolution label', () => {
  expect(resolveExportTargetBitrate(createSettings())).toBe(8_000_000);
  expect(
    resolveExportTargetBitrate(createSettings({ fps: 60, resolution: VideoResolutionPreset.P1440 }))
  ).toBe(12_000_000);
  expect(
    resolveExportTargetBitrate(
      createSettings({
        fps: 60,
        height: 1440,
        resolution: VideoResolutionPreset.P1440,
        width: 2560,
      })
    )
  ).toBe(24_000_000);
});
