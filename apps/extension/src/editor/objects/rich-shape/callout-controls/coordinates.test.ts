// @vitest-environment jsdom

import { Group, type TMat2D } from 'fabric';
import { expect, it, vi } from 'vitest';

import { createDefaultRichShapeObject } from '../../../../features/editor/document/rich-shape';
import type { RichShapeCalloutGroup } from './types';

import {
  clampCalloutControlValue,
  toCalloutShapePoint,
  toCalloutViewportPoint,
} from './coordinates';

const IDENTITY_MATRIX: TMat2D = [1, 0, 0, 1, 0, 0];

function createCalloutObject(width?: number, height?: number): RichShapeCalloutGroup {
  const object = Object.assign(new Group(), {
    sniptaleRichShape: createDefaultRichShapeObject({
      frame: { height: 40, left: 0, top: 0, width: 80 },
    }),
  });
  Object.defineProperties(object, {
    height: { configurable: true, value: height },
    width: { configurable: true, value: width },
  });
  vi.spyOn(object, 'calcOwnMatrix').mockReturnValue([...IDENTITY_MATRIX]);
  vi.spyOn(object, 'calcTransformMatrix').mockReturnValue([...IDENTITY_MATRIX]);
  vi.spyOn(object, 'getViewportTransform').mockReturnValue([...IDENTITY_MATRIX]);
  return object;
}

it('clamps invalid and out-of-range callout control values', () => {
  expect(clampCalloutControlValue(Number.NaN, 0, 10)).toBe(0);
  expect(clampCalloutControlValue(-5, 0, 10)).toBe(0);
  expect(clampCalloutControlValue(15, 0, 10)).toBe(10);
  expect(clampCalloutControlValue(5, 0, 10)).toBe(5);
});

it('converts callout points with explicit object dimensions', () => {
  const object = createCalloutObject(100, 60);

  expect(toCalloutViewportPoint(object, { x: 60, y: 40 })).toEqual(
    expect.objectContaining({ x: 10, y: 10 })
  );
  expect(toCalloutShapePoint(object, -100, 100)).toEqual({ x: 0, y: 60 });
});

it('falls back to persisted frame dimensions for callout point conversion', () => {
  const object = createCalloutObject();

  expect(toCalloutViewportPoint(object, { x: 50, y: 30 })).toEqual(
    expect.objectContaining({ x: 10, y: 10 })
  );
  expect(toCalloutShapePoint(object, 0, 0)).toEqual({ x: 40, y: 20 });
});
