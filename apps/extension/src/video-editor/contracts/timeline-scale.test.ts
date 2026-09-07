import { expect, it } from 'vitest';
import { clampTimelineScale } from './timeline-scale';
it('preserves fractional overview scales and bounds invalid values to finite geometry', () => {
  expect(clampTimelineScale(0.01)).toBe(0.01);
  expect(clampTimelineScale(90)).toBe(90);
  expect(clampTimelineScale(-Infinity)).toBe(0.005);
  expect(clampTimelineScale(Infinity)).toBe(280);
  expect(clampTimelineScale(NaN)).toBe(90);
});
