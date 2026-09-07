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
  expect(mapTimelineZoomSliderToPixelsPerSecond(100)).toBe(280);
});
