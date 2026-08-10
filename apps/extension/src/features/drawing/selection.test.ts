import { expect, it } from 'vitest';
import { getDrawingObjectSelectionBounds, resolveDrawingMarqueeSelection } from './selection';
import type { DrawingObject } from './model';

const objects: DrawingObject[] = [
  {
    bounds: { x: 10, y: 10, width: 30, height: 20 },
    color: '#000000',
    id: 'one',
    kind: 'rectangle',
    width: 2,
  },
  {
    bounds: { x: 80, y: 80, width: 20, height: 20 },
    color: '#000000',
    id: 'two',
    kind: 'ellipse',
    width: 2,
  },
];

it('selects every object intersecting the marquee in either drag direction', () => {
  expect(
    resolveDrawingMarqueeSelection({
      current: { x: 0, y: 0 },
      initialIds: [],
      mode: 'replace',
      objects,
      start: { x: 50, y: 50 },
    })
  ).toEqual(['one']);
});

it('adds with Shift semantics and toggles with Ctrl semantics', () => {
  const gesture = { current: { x: 110, y: 110 }, objects, start: { x: 0, y: 0 } };
  expect(resolveDrawingMarqueeSelection({ ...gesture, initialIds: ['one'], mode: 'add' })).toEqual([
    'one',
    'two',
  ]);
  expect(
    resolveDrawingMarqueeSelection({ ...gesture, initialIds: ['one'], mode: 'toggle' })
  ).toEqual(['two']);
});

it('uses transformed bounds for rotated objects', () => {
  const rotated: DrawingObject = {
    bounds: { x: 10, y: 10, width: 30, height: 20 },
    color: '#000000',
    id: 'rotated',
    kind: 'rectangle',
    rotation: 90,
    width: 2,
  };
  const bounds = getDrawingObjectSelectionBounds(rotated);
  expect(bounds.x).toBeCloseTo(15);
  expect(bounds).toMatchObject({ y: 5, width: 20, height: 30 });
});
