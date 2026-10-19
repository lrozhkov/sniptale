import { expect, it } from 'vitest';
import { roundedWindowClearance, roundedWindowRadius } from './window-geometry';

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
