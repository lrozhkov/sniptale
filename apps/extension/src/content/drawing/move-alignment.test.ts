import { expect, it } from 'vitest';
import {
  getDrawingSelectionBounds,
  translateDrawingObject,
  type DrawingObject,
} from '../../features/drawing/public';
import { resolveDrawingMoveAlignment } from './move-alignment';

function shape(
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 100
): Extract<DrawingObject, { kind: 'rectangle' }> {
  return { id, kind: 'rectangle', bounds: { x, y, width, height }, color: '#f00', width: 2 };
}
function text(x: number, y: number): DrawingObject {
  return {
    id: 'text',
    kind: 'text',
    bounds: { x, y, width: 80, height: 20 },
    text: 'Title',
    color: '#000',
    backgroundColor: null,
    fontSize: 16,
  };
}

it('aligns neighboring edges on each axis and releases beyond six CSS pixels', () => {
  const target = shape('target', 300, 200);
  const moving = shape('moving', 204, 203, 100, 60);
  const aligned = resolveDrawingMoveAlignment({ moving: [moving], objects: [target, moving] });
  expect(aligned.delta).toEqual({ x: -4, y: -3 });
  expect(aligned.guides).toHaveLength(2);
  expect(
    resolveDrawingMoveAlignment({ moving: [shape('moving', 207, 207, 100, 60)], objects: [target] })
      .guides
  ).toEqual([]);
});

it.each(['rectangle', 'ellipse', 'triangle'] as const)(
  'centers text inside %s without moving the containing shape',
  (kind) => {
    const target: DrawingObject = { ...shape('target', 100, 100, 240, 160), kind };
    const moving = text(184, 173);
    expect(
      resolveDrawingMoveAlignment({ moving: [moving], objects: [target, moving] }).delta
    ).toEqual({ x: -4, y: -3 });
    expect(target).toMatchObject({ bounds: { x: 100, y: 100, width: 240, height: 160 } });
  }
);

it('aligns text to the inner rectangle edge with breathing room', () => {
  const target = shape('target', 100, 100, 240, 160);
  expect(resolveDrawingMoveAlignment({ moving: [text(111, 170)], objects: [target] }).delta.x).toBe(
    -3
  );
});

it('prefers the smallest containing frame over DOM and outer frames', () => {
  const moving = text(184, 173);
  const result = resolveDrawingMoveAlignment({
    moving: [moving],
    objects: [shape('outer', 0, 0, 800, 600), shape('inner', 100, 100, 240, 160)],
    domBounds: [{ x: 184, y: 173, width: 80, height: 20 }],
  });
  expect(result.delta).toEqual({ x: -4, y: -3 });
});

it('does not align with itself, remote shapes or center-to-edge coincidences', () => {
  const moving = shape('moving', 100, 100);
  expect(
    resolveDrawingMoveAlignment({ moving: [moving], objects: [moving, shape('far', 102, 1000)] })
      .guides
  ).toEqual([]);
  expect(
    resolveDrawingMoveAlignment({ moving: [moving], objects: [shape('other', 150, 250, 200, 40)] })
      .delta.x
  ).toBe(0);
});

it('moves a group by one common correction and excludes all selected objects', () => {
  const moving = [shape('a', 104, 104, 20, 20), shape('b', 144, 124, 20, 20)];
  const alignment = resolveDrawingMoveAlignment({
    moving,
    objects: [...moving, shape('target', 100, 200, 60, 20)],
  });
  const result = moving.map((object) => translateDrawingObject(object, alignment.delta));
  expect(alignment.delta.x).toBe(-4);
  expect(getDrawingSelectionBounds(result)?.width).toBe(60);
});

it('uses rotated visual bounds and retains fractional alignment', () => {
  const target = { ...shape('target', 100, 100, 120, 40), rotation: 90 };
  const moving = shape('moving', 143.5, 160, 20, 20);
  expect(resolveDrawingMoveAlignment({ moving: [moving], objects: [target] }).delta.x).toBe(-3.5);
});

it('aligns with DOM geometry and leaves unsupported drawing tools alone', () => {
  const moving = shape('moving', 104, 103, 100, 60);
  expect(
    resolveDrawingMoveAlignment({
      moving: [moving],
      objects: [],
      domBounds: [{ x: 100, y: 100, width: 100, height: 60 }],
    }).delta
  ).toEqual({ x: -4, y: -3 });
  const blur: DrawingObject = {
    id: 'blur',
    kind: 'blur',
    bounds: { x: 104, y: 103, width: 100, height: 60 },
  };
  expect(resolveDrawingMoveAlignment({ moving: [blur], objects: [moving] }).guides).toEqual([]);
});
