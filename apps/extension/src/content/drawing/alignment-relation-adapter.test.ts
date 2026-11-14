import { expect, it } from 'vitest';
import type { DrawingObject } from '../../features/drawing/public';
import {
  collectDrawingResizeDimensionChoices,
  measureDrawingRelationDimensions,
} from './alignment-relation-adapter';
const box = (id = 'source'): Extract<DrawingObject, { kind: 'rectangle' }> => ({
  id,
  kind: 'rectangle',
  bounds: { x: 100, y: 100, width: 120, height: 80 },
  color: '#f00',
  width: 2,
});

it('measures a rotated logical edge and omits unsupported sheared dimensions', () => {
  const dimensions = measureDrawingRelationDimensions({ ...box(), rotation: 30 });
  expect(dimensions.width?.value).toBe(120);
  expect(
    Math.hypot(
      dimensions.width!.to.x - dimensions.width!.from.x,
      dimensions.width!.to.y - dimensions.width!.from.y
    )
  ).toBeCloseTo(120, 8);
  expect(dimensions.width!.to.y).not.toBe(dimensions.width!.from.y);
  expect(measureDrawingRelationDimensions({ ...box(), skewX: 15 })).toEqual({ id: 'source' });
});

it.each([false, true])(
  'converts the same logical difference to centered=%s handle motion without prefiltering',
  (centered) => {
    const source = box();
    const peer = { ...box('peer'), bounds: { x: 700, y: 400, width: 132, height: 30 } };
    const result = collectDrawingResizeDimensionChoices({
      original: source,
      object: source,
      geometry: { x: 1, y: 0 },
      modifiers: { ctrlKey: centered, shiftKey: false },
      objects: [source, peer],
    });
    expect(result.dimensions).toHaveLength(1);
    expect(result.dimensions[0]?.local).toEqual({ x: centered ? 6 : 12, y: 0 });
    expect(result.dimensions[0]?.correction).toEqual({ x: centered ? 6 : 12, y: 0 });
  }
);

it('converts a height relation to the active horizontal degree of freedom under ratio lock', () => {
  const source = box();
  const peer = { ...box('peer'), bounds: { x: 700, y: 400, width: 333, height: 84 } };
  const result = collectDrawingResizeDimensionChoices({
    original: source,
    object: source,
    geometry: { x: -1, y: 0 },
    modifiers: { ctrlKey: false, shiftKey: true },
    objects: [peer],
  });
  expect(result.dimensions.find((entry) => entry.candidate.dimension === 'height')?.local).toEqual({
    x: -6,
    y: 0,
  });
});
