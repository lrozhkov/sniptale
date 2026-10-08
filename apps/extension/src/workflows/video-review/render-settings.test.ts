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

it('admits adaptive60 and rejects unsupported modes or incompatible rates', () => {
  const advanced = createQuickEditAdvancedState();
  expect(
    resolveReviewOutputProfile(index, advanced, {
      quality: 'HIGH',
      frameRate: 60,
      frameRateMode: 'adaptive',
    }).fps
  ).toBe(60);
  expect(() =>
    resolveReviewOutputProfile(index, advanced, {
      quality: 'HIGH',
      frameRate: 30,
      frameRateMode: 'adaptive',
    })
  ).toThrow('Invalid');
});

it.each([24, 30, 60] as const)(
  'keeps explicit %sfps exact for a fractional source',
  (frameRate) => {
    expect(
      resolveReviewOutputProfile(
        { ...index, frameRate: 30000 / 1001 },
        createQuickEditAdvancedState(),
        { quality: 'HIGH', frameRate }
      ).fps
    ).toBe(frameRate);
  }
);

describe('rational selected output rate', () => {
  const advanced = createQuickEditAdvancedState();
  it.each([
    [24, 24, 1],
    [30, 30, 1],
    [60, 60, 1],
    [1, 1, 1],
    [120, 120, 1],
    [30000 / 1001, 30000, 1001],
    [60000 / 1001, 60000, 1001],
    [29.83, 2983, 100],
    [30000 / 1001 + 1e-10, 30000, 1001],
    [30000 / 1001 - 1e-10, 30000, 1001],
    [60000 / 1001 + 1e-10, 60000, 1001],
    [60000 / 1001 - 1e-10, 60000, 1001],
    [29.97, 2997, 100],
    [59.94, 2997, 50],
  ])('represents selected %sfps as %s/%s', (frameRate, numerator, denominator) => {
    const result = resolveReviewOutputProfile({ ...index, frameRate }, advanced);
    expect(result.rate).toEqual({ numerator, denominator });
    expect(result.fps).toBe(numerator / denominator);
    expect(Math.abs(result.fps - frameRate)).toBeLessThanOrEqual(1e-9);
  });
  it.each([24, 30, 60] as const)(
    'keeps explicit %s distinct from fractional Current',
    (frameRate) => {
      const result = resolveReviewOutputProfile({ ...index, frameRate: 30000 / 1001 }, advanced, {
        quality: 'HIGH',
        frameRate,
      });
      expect(result.rate).toEqual({ numerator: frameRate, denominator: 1 });
    }
  );
  it('uses the existing fallback only when source metadata is absent', () => {
    const { frameRate: _frameRate, ...withoutRate } = index;
    expect(resolveReviewOutputProfile(withoutRate, advanced).rate).toEqual({
      numerator: 30,
      denominator: 1,
    });
    expect(
      resolveReviewOutputProfile({ ...index, frameRate: 29.83 }, advanced, {
        quality: 'HIGH',
        frameRate: 0,
      }).rate
    ).toEqual({ numerator: 2983, denominator: 100 });
  });
  it.each([NaN, Infinity, -Infinity, 0, -1, 0.999, 120.001])(
    'rejects invalid selected %sfps',
    (frameRate) => {
      expect(() => resolveReviewOutputProfile({ ...index, frameRate }, advanced)).toThrow(
        'Invalid output frame rate'
      );
    }
  );
  it('bounds approximation throughout the supported domain with safe reduced fractions', () => {
    const samples = [Math.PI * 10, Math.SQRT2, 1.00000000101, 119.99999999899, 29.9700299711];
    for (let step = 0; step <= 1190; step++)
      samples.push(1 + step / 10, Math.min(120, 1 + step / 10 + 0.0000123456789));
    for (const frameRate of samples) {
      const result = resolveReviewOutputProfile({ ...index, frameRate }, advanced);
      expect(Number.isSafeInteger(result.rate.numerator)).toBe(true);
      expect(Number.isSafeInteger(result.rate.denominator)).toBe(true);
      expect(result.rate.denominator).toBeGreaterThan(0);
      expect(result.rate.denominator).toBeLessThanOrEqual(1e9);
      expect(result.fps).toBe(result.rate.numerator / result.rate.denominator);
      expect(Math.abs(result.fps - frameRate)).toBeLessThanOrEqual(1e-9);
      let a = result.rate.numerator,
        b = result.rate.denominator;
      while (b) {
        const next = a % b;
        a = b;
        b = next;
      }
      expect(a).toBe(1);
    }
  });
  it('does not snap a measurement outside tolerance to a catalog rate', () => {
    const measured = 30000 / 1001 + 1e-7;
    const result = resolveReviewOutputProfile({ ...index, frameRate: measured }, advanced);
    expect(result.rate).not.toEqual({ numerator: 30000, denominator: 1001 });
    expect(Math.abs(result.fps - measured)).toBeLessThanOrEqual(1e-9);
  });
});
