import { DEFAULT_WINDOW_HEADER } from '../../features/browser-frame/header';
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
      width: 404,
      height: 720,
      fps: 30,
    });
    expect(resolveReviewRenderBitrate({ width: 1920, height: 1080, fps: 30 })).toBe(8_000_000);
  });
  it('rejects nonfinite dimensions instead of forwarding an invalid encoder budget', () => {
    expect(() => resolveReviewRenderBitrate({ width: NaN, height: 1080, fps: 30 })).toThrow();
  });
});

it('fits the complete decorated scene and reports source encoder budget overflow', () => {
  const state = createQuickEditAdvancedState();
  state.ui.mode = 'advanced';
  state.windowHeader = { ...DEFAULT_WINDOW_HEADER, kind: 'browser' as const, title: 'Browser' };
  const source = { ...index, width: 1920, height: 1080 };
  expect(
    resolveReviewOutputProfile(source, state, {
      quality: 'HIGH',
      frameRate: 30,
      resolution: '1080P',
    })
  ).toMatchObject({ width: 1750, height: 1080, dimensionsSupported: true });
  expect(
    resolveReviewOutputProfile(source, state, {
      quality: 'HIGH',
      frameRate: 30,
      resolution: '720P',
    })
  ).toMatchObject({ width: 1166, height: 720 });
  state.canvas = { width: 7680, height: 4320 };
  expect(resolveReviewOutputProfile(source, state)).toMatchObject({ dimensionsSupported: false });
  expect(
    resolveReviewOutputProfile(source, state, {
      quality: 'HIGH',
      frameRate: 30,
      resolution: '1080P',
    })
  ).toMatchObject({ dimensionsSupported: true });
});

it('keeps a 1904x1064 source inside 1080p without upscaling and honors explicit 30fps', () => {
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  const source = { ...index, width: 1904, height: 1064, frameRate: 40 };
  expect(
    resolveReviewOutputProfile(source, advanced, {
      format: 'mp4',
      codec: 'hevc',
      resolution: '1080P',
      quality: 'HIGH',
      frameRate: 30,
    })
  ).toMatchObject({ width: 1904, height: 1064, fps: 30, codec: 'hevc' });
});
