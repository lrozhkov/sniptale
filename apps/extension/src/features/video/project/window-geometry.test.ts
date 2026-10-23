import {
  DEFAULT_WINDOW_HEADER,
  windowHeaderGeometry,
} from '@sniptale/runtime-contracts/window-header';
import { expect, it } from 'vitest';
import {
  decoratedMediaSourceSize,
  insetMediaCanvas,
  mediaWindowPadding,
  roundedWindowClearance,
  roundedWindowRadius,
  resolveMediaFitFrame,
} from './window-geometry';

it('clamps window radius without changing its visible bounds', () => {
  expect(roundedWindowRadius(200, 100, 4096)).toBe(50);
  expect(roundedWindowRadius(200, 100, 12.5)).toBe(12.5);
  expect(roundedWindowRadius(200, 100, 0)).toBe(0);
});

it('distinguishes clipped corners, straight edges, circular boundary and interior intervals', () => {
  expect(roundedWindowClearance([0, 0], [0, 0], 100, 100, 50).high).toBeCloseTo(
    50 - Math.hypot(50, 50)
  );
  expect(roundedWindowClearance([50, 50], [0, 0], 100, 100, 50)).toEqual({ low: -0, high: -0 });
  expect(roundedWindowClearance([50, 50], [50, 50], 100, 100, 50)).toEqual({ low: 50, high: 50 });
  expect(roundedWindowClearance([20, 80], [40, 60], 100, 100, 20).low).toBe(20);
  expect(roundedWindowClearance([0, 100], [0, 100], 100, 100, 0)).toEqual({ low: -0, high: 50 });
});

it('encloses every sampled signed clearance with conservative interval bounds', () => {
  const bounds = roundedWindowClearance([5, 72], [8, 40], 100, 60, 25);
  for (let x = 5; x <= 72; x += 3)
    for (let y = 8; y <= 40; y += 2) {
      const distance = roundedWindowClearance([x, x], [y, y], 100, 60, 25);
      expect(distance.low).toBeGreaterThanOrEqual(bounds.low - 1e-9);
      expect(distance.high).toBeLessThanOrEqual(bounds.high + 1e-9);
    }
});

it('keeps Gallery inset behavior including one-pixel collapse and fractional padding', () => {
  expect(insetMediaCanvas({ width: 320, height: 180 }, 12.25)).toEqual({
    x: 12.25,
    y: 12.25,
    width: 295.5,
    height: 155.5,
  });
  expect(insetMediaCanvas({ width: 320, height: 180 }, 4096)).toEqual({
    x: 160,
    y: 90,
    width: 1,
    height: 1,
  });
  expect(insetMediaCanvas({ width: 320, height: 180 }, 0)).toEqual({
    x: 0,
    y: 0,
    width: 320,
    height: 180,
  });
});

it('measures rotated windows about the actual clip pivot and admits off-canvas placement as zero inset', () => {
  const output = { width: 320, height: 180 };
  expect(mediaWindowPadding(output, { x: 100, y: 40, width: 120, height: 100 })).toBe(40);
  expect(mediaWindowPadding(output, { x: 100, y: 40, width: 120, height: 100 }, 90)).toBeCloseTo(
    30
  );
  expect(mediaWindowPadding(output, { x: -1, y: 40, width: 120, height: 100 })).toBe(0);
  const result = mediaWindowPadding(output, { x: 100, y: 40, width: 80, height: 100 }, 90, {
    x: 160,
    y: 90,
  });
  expect(result).toBeCloseTo(30);
});

it('decorates already-cropped source dimensions with the canonical header exactly once', () => {
  const source = { width: 80, height: 90 };
  expect(decoratedMediaSourceSize(80, 90)).toEqual(source);
  expect(decoratedMediaSourceSize(80, 90, DEFAULT_WINDOW_HEADER)).toEqual({
    width: 80,
    height: 90 + windowHeaderGeometry(DEFAULT_WINDOW_HEADER, source).height,
  });
});

it('keeps odd-aspect contain geometry fractional and ignores dormant cover crop', () => {
  const frame = resolveMediaFitFrame({
    source: { width: 641, height: 359 },
    output: { width: 321, height: 181 },
    fit: 'contain',
    crop: { panX: 0.75, panY: -0.6 },
  });
  expect(frame.width).toBe(321);
  expect(frame.height).toBeCloseTo(179.78003120124805, 9);
  expect(frame.x).toBe(0);
  expect(frame.y).toBeCloseTo(0.609984399375975, 9);
});

it.each([
  [641, 359, 323.1782729805014, 181, -1.9059888579387188, 0],
  [359, 641, 321, 573.150417827298, 0, -78.43008356545961],
])('positions odd cover source %sx%s on the fractional output plane', (sw, sh, w, h, x, y) => {
  const frame = resolveMediaFitFrame({
    source: { width: sw, height: sh },
    output: { width: 321, height: 181 },
    fit: 'cover',
    crop: { panX: 0.75, panY: -0.6 },
  });
  expect(frame.width).toBeCloseTo(w, 9);
  expect(frame.height).toBeCloseTo(h, 9);
  expect(frame.x).toBeCloseTo(x, 9);
  expect(frame.y).toBeCloseTo(y, 9);
});
