import { expect, it } from 'vitest';
import { getMediaFramingPresets } from './framing-presets';

it.each([
  [1920, 1080, 1920, 1080],
  [1920, 1080, 1080, 1920],
  [1080, 1920, 1920, 1080],
  [1920, 1080, 1080, 1080],
])('centers proportional presets for %s×%s on %s×%s', (sw, sh, cw, ch) => {
  const presets = getMediaFramingPresets(sw, sh, cw, ch);
  expect(presets).toHaveLength(3);
  for (const { transform: t } of presets) {
    expect(t.width / t.height).toBeCloseTo(sw / sh);
    expect(Math.abs(t.x + t.width / 2 - cw / 2)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(t.y + t.height / 2 - ch / 2)).toBeLessThanOrEqual(0.5);
  }
  const inset = presets[1]!.transform;
  expect(inset.x).toBeGreaterThan(0);
  expect(inset.y).toBeGreaterThan(0);
  const fill = presets[2]!.transform;
  expect(fill.width).toBeGreaterThanOrEqual(cw);
  expect(fill.height).toBeGreaterThanOrEqual(ch);
});

it('uses smaller decorative margins for mismatched aspect ratios and scales with the canvas', () => {
  const matching = getMediaFramingPresets(1920, 1080, 1920, 1080)[1]!;
  const portrait = getMediaFramingPresets(1920, 1080, 1080, 1920)[1]!;
  expect(portrait.fitScalePercent).toBeGreaterThan(matching.fitScalePercent);
  const hd = getMediaFramingPresets(1920, 1080, 1280, 720)[1]!;
  expect(hd.fitScalePercent).toBe(matching.fitScalePercent);
  expect(Math.abs(hd.transform.width - (matching.transform.width * 2) / 3)).toBeLessThanOrEqual(1);
  expect(getMediaFramingPresets(0, 1080, 1920, 1080)).toEqual([]);
});
