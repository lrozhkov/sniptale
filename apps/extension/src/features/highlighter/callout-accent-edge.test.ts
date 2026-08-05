import { expect, it } from 'vitest';
import { getCalloutAccentEdgePath } from './callout-accent-edge';

it('places a top accent exactly on the outer edge', () => {
  expect(
    getCalloutAccentEdgePath({
      rect: { x: 0, y: 0, width: 120, height: 60 },
      side: 'top',
    })
  ).toBe('M 0 0 H 120');
});

it('covers a complete left edge from corner to corner', () => {
  expect(
    getCalloutAccentEdgePath({
      rect: { x: 0, y: 0, width: 120, height: 60 },
      side: 'left',
    })
  ).toBe('M 0 60 V 0');
});

it('places a right accent exactly on the outer edge', () => {
  expect(
    getCalloutAccentEdgePath({
      rect: { x: 0, y: 0, width: 120, height: 60 },
      side: 'right',
    })
  ).toBe('M 120 0 V 60');
});

it('places a bottom accent exactly on the outer edge', () => {
  expect(
    getCalloutAccentEdgePath({
      rect: { x: 0, y: 0, width: 120, height: 60 },
      side: 'bottom',
    })
  ).toBe('M 120 60 H 0');
});
