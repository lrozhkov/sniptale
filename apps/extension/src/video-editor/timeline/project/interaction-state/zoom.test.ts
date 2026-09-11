import { expect, it } from 'vitest';
import {
  mapTimelinePixelsPerSecondToSliderValue,
  mapTimelineZoomSliderToPixelsPerSecond,
} from './zoom';
it('provides a monotonic reversible overview-to-detail slider', () => {
  let previous = 0;
  for (let value = 0; value <= 100; value++) {
    const scale = mapTimelineZoomSliderToPixelsPerSecond(value);
    expect(scale).toBeGreaterThan(previous);
    expect(mapTimelinePixelsPerSecondToSliderValue(scale)).toBe(value);
    previous = scale;
  }
  expect(mapTimelineZoomSliderToPixelsPerSecond(0)).toBe(0.005);
  expect(mapTimelineZoomSliderToPixelsPerSecond(100)).toBe(23040);
});

it('uses a minute-long project and its viewport instead of a multi-hour overview', () => {
  const range = { duration: 60, viewportWidth: 1200, fps: 30 };
  const minimum = mapTimelineZoomSliderToPixelsPerSecond(0, range);
  expect(1200 / minimum).toBeLessThan(70);
  expect(1200 / minimum).toBeGreaterThanOrEqual(60);
  for (let value = 0; value <= 100; value++) {
    const scale = mapTimelineZoomSliderToPixelsPerSecond(value, range);
    expect(mapTimelinePixelsPerSecondToSliderValue(scale, range)).toBe(value);
  }
  const middle = mapTimelineZoomSliderToPixelsPerSecond(50, range);
  expect(mapTimelineZoomSliderToPixelsPerSecond(51, range) / middle).toBeLessThan(1.06);
});
