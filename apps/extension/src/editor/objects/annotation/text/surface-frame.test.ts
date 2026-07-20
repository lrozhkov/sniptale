import { expect, it } from 'vitest';

import { getTextCalloutBodyRect, getTextCalloutTailMetrics } from './surface-frame';

it('resolves body rectangles for every text callout surface format', () => {
  const surface = { height: 120, width: 180 };

  expect(getTextCalloutBodyRect(surface, 'plain')).toEqual({
    height: 120,
    left: 0,
    top: 0,
    width: 180,
  });
  expect(getTextCalloutBodyRect(surface, 'panel')).toEqual({
    height: 104,
    left: 8,
    top: 8,
    width: 164,
  });
  expect(getTextCalloutBodyRect(surface, 'pointer')).toEqual({
    height: 104,
    left: 44,
    top: 8,
    width: 128,
  });
  expect(getTextCalloutBodyRect(surface, 'flag')).toEqual({
    height: 104,
    left: 8,
    top: 8,
    width: 140,
  });
});

it('clamps tail metrics against small callout surfaces', () => {
  const surface = { height: 12, width: 24 };

  expect(getTextCalloutTailMetrics(surface, 'bubble')).toEqual({
    halfWidth: 12,
    height: 8,
  });
  expect(getTextCalloutTailMetrics(surface, 'arrow-bubble')).toEqual({
    halfWidth: 12,
    height: 8,
    shoulderOffset: 4,
  });
  expect(getTextCalloutTailMetrics(surface, 'pointer')).toEqual({ width: 12 });
  expect(getTextCalloutTailMetrics(surface, 'flag')).toEqual({ notchWidth: 12 });
});
