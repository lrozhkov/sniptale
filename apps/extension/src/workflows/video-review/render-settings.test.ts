import { describe, expect, it } from 'vitest';
import {
  resolveVideoTargetBitrate,
  VideoQuality,
} from '@sniptale/runtime-contracts/video/types/types';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { resolveReviewRenderBitrate, resolveReviewOutputProfile } from './render-settings';
import type { ReviewMediaIndex } from './media-index';

const index: ReviewMediaIndex = {
  duration: 76,
  boundaries: [0, 76],
  videoCodec: 'avc',
  audioCodec: 'aac',
  container: 'mp4',
  rotation: 0,
  width: 1904,
  height: 984,
  frameRate: 40,
  outputCodecs: { mp4: ['avc', 'hevc', 'vp9'], webm: ['vp9', 'vp8'] },
};

describe('calibrated quick-edit export profile', () => {
  it.each(Object.values(VideoQuality))(
    'uses the editor %s quality ladder without a sparse-source cap',
    (quality) => {
      const output = { width: 1920, height: 1080, fps: 40 };
      expect(resolveReviewRenderBitrate(output, quality)).toBe(
        resolveVideoTargetBitrate({ ...output, quality })
      );
    }
  );
  it('defaults to high quality and preserves scene aspect ratio when resizing export', () => {
    const advanced = createQuickEditAdvancedState();
    advanced.ui.mode = 'advanced';
    advanced.canvas = { width: 1080, height: 1920 };
    const profile = resolveReviewOutputProfile(index, advanced, {
      format: 'webm',
      codec: 'vp9',
      resolution: '720P',
      quality: 'HIGH',
      frameRate: 30,
    });
    expect(profile).toMatchObject({
      format: 'webm',
      codec: 'vp9',
      width: 406,
      height: 720,
      fps: 30,
    });
    expect(resolveReviewRenderBitrate({ width: 1920, height: 1080, fps: 30 })).toBe(8_000_000);
  });
  it('rejects nonfinite dimensions instead of forwarding an invalid encoder budget', () => {
    expect(() => resolveReviewRenderBitrate({ width: NaN, height: 1080, fps: 30 })).toThrow();
  });
});
