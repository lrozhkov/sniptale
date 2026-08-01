import { expect, it } from 'vitest';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import { VideoExportQualityPreset, VideoMp4Codec } from '../../../features/video/project/types';
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

it('uses an exact standard-profile ladder instead of a pixel-ratio heuristic', () => {
  expect(resolveExportTargetBitrate(createSettings(), VideoMp4Codec.AVC)).toBe(8_000_000);
  expect(
    resolveExportTargetBitrate(
      createSettings({ fps: 60, resolution: VideoResolutionPreset.P1440 }),
      VideoMp4Codec.AVC
    )
  ).toBe(24_000_000);
});

it('accounts for codec efficiency while preserving one quality vocabulary', () => {
  const avc = resolveExportTargetBitrate(createSettings(), VideoMp4Codec.AVC);
  const hevc = resolveExportTargetBitrate(createSettings(), VideoMp4Codec.HEVC);
  const vp9 = resolveExportTargetBitrate(createSettings(), VideoMp4Codec.VP9);

  expect(avc).toBe(8_000_000);
  expect(hevc).toBe(6_000_000);
  expect(vp9).toBe(6_000_000);
});
