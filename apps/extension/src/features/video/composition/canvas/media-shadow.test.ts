import { expect, it } from 'vitest';
import { VideoMediaShadowMode } from '../../project/types/index';
import {
  normalizeVideoMediaShadowIntensity,
  normalizeVideoMediaShadowMode,
  resolveVideoMediaShadowCss,
  resolveVideoMediaShadowParams,
} from './media-shadow';

it('normalizes media shadow intensity into the persisted slider range', () => {
  expect(normalizeVideoMediaShadowIntensity(undefined)).toBe(0);
  expect(normalizeVideoMediaShadowIntensity(Number.NaN)).toBe(0);
  expect(normalizeVideoMediaShadowIntensity(-20)).toBe(0);
  expect(normalizeVideoMediaShadowIntensity(42.4)).toBe(42);
  expect(normalizeVideoMediaShadowIntensity(140)).toBe(100);
  expect(normalizeVideoMediaShadowMode(undefined)).toBe(VideoMediaShadowMode.BACKDROP);
  expect(normalizeVideoMediaShadowMode(VideoMediaShadowMode.GLOW)).toBe(VideoMediaShadowMode.GLOW);
});

it('resolves deterministic CSS and canvas params for preview and export parity', () => {
  expect(resolveVideoMediaShadowCss(50)).toBe('0px 0px 24px rgba(0, 0, 0, 0.28)');
  expect(resolveVideoMediaShadowParams(50, 2)).toEqual({
    blur: 48,
    color: 'rgba(0, 0, 0, 0.28)',
    offsetX: 0,
    offsetY: 0,
    paint: { color: 'rgba(0, 0, 0, 1)', kind: 'outer-shadow' },
  });
  expect(resolveVideoMediaShadowCss(0)).toBeUndefined();
});

it('resolves glow shadows without a dark offset underlay', () => {
  expect(resolveVideoMediaShadowCss(50, VideoMediaShadowMode.GLOW)).toBe(
    '0px 0px 29px rgba(255, 255, 255, 0.34)'
  );
  expect(resolveVideoMediaShadowParams(50, 2, VideoMediaShadowMode.GLOW)).toEqual({
    blur: 58,
    color: 'rgba(255, 255, 255, 0.34)',
    offsetX: 0,
    offsetY: 0,
    paint: { color: 'rgba(255, 255, 255, 1)', kind: 'outer-shadow' },
  });
});

it('gives camera shadows and glow a strong upper range without changing other media', () => {
  for (const mode of ['BACKDROP', 'GLOW'] as const) {
    const normal = resolveVideoMediaShadowParams(100, 1, mode)!;
    const strong = resolveVideoMediaShadowParams(100, 1, mode, true)!;
    expect(strong.color).toContain('0.95');
    expect(strong.blur).toBeLessThan(normal.blur);
    expect(resolveVideoMediaShadowParams(0, 1, mode, true)).toBeNull();
    const scaled = resolveVideoMediaShadowParams(100, 2, mode, true)!;
    expect(scaled.blur).toBe(strong.blur * 2);
    expect(scaled.offsetY).toBe(strong.offsetY * 2);
  }
});
