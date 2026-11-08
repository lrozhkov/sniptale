import { expect, it } from 'vitest';
import {
  getDrawingSelectionBounds,
  getDrawingObjectSelectionBounds,
  translateDrawingObject,
  type DrawingObject,
} from '../../features/drawing/public';
import { createDefaultSimplifySettings } from '../../features/simplify/settings';
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

it('aligns with DOM geometry for blur objects', () => {
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
  expect(
    resolveDrawingMoveAlignment({
      moving: [blur],
      objects: [],
      domBounds: [{ x: 100, y: 100, width: 100, height: 60 }],
    }).delta
  ).toEqual({ x: -4, y: -3 });
});

it('marks the aligned source and target edge endpoints, using centers for center matches', () => {
  const moving = shape('moving', 304, 80, 80, 60);
  const target = shape('target', 300, 200, 100, 100);
  const edge = resolveDrawingMoveAlignment({ moving: [moving], objects: [target] });
  expect(edge.guides.find((guide) => guide.axis === 'x')?.points).toEqual([
    { x: 300, y: 80 },
    { x: 300, y: 140 },
    { x: 300, y: 200 },
    { x: 300, y: 300 },
  ]);
  const center = resolveDrawingMoveAlignment({
    moving: [text(184, 173)],
    objects: [shape('frame', 100, 100, 240, 160)],
  });
  expect(center.guides.find((guide) => guide.axis === 'x')?.points).toEqual([
    { x: 220, y: 180 },
    { x: 220, y: 180 },
  ]);
  expect(center.guides.find((guide) => guide.axis === 'y')?.points).toEqual([
    { x: 220, y: 180 },
    { x: 220, y: 180 },
  ]);
});

const allKinds: DrawingObject[] = [
  ...(['rectangle', 'ellipse', 'triangle', 'parallelogram'] as const).map((kind) => ({
    ...shape(kind, 104, 103),
    kind,
  })),
  {
    id: 'pencil',
    kind: 'pencil',
    samples: [
      { x: 104, y: 103, t: 0 },
      { x: 204, y: 203, t: 1 },
    ],
    color: '#000',
    width: 2,
  },
  {
    id: 'marker',
    kind: 'marker',
    samples: [
      { x: 104, y: 103, t: 0 },
      { x: 204, y: 203, t: 1 },
    ],
    color: '#000',
    width: 8,
    opacity: 0.5,
  },
  {
    id: 'arrow',
    kind: 'arrow',
    start: { x: 104, y: 103 },
    end: { x: 204, y: 203 },
    bendPoints: [{ x: 180, y: 90 }],
    color: '#000',
    width: 2,
    dynamicWidth: false,
  },
  { id: 'blur', kind: 'blur', bounds: { x: 104, y: 103, width: 100, height: 100 } },
  {
    id: 'simplify',
    kind: 'simplify',
    bounds: { x: 104, y: 103, width: 100, height: 100 },
    settings: createDefaultSimplifySettings(),
  },
  text(104, 103),
];
it.each(allKinds)('aligns $kind full selection bounds as both source and target', (object) => {
  const bounds = getDrawingObjectSelectionBounds(object);
  const target = { x: bounds.x - 4, y: bounds.y - 3, width: bounds.width, height: bounds.height };
  expect(
    resolveDrawingMoveAlignment({ moving: [object], objects: [object], domBounds: [target] }).delta
  ).toEqual({ x: -4, y: -3 });
  const moving = shape('other', bounds.x - 4, bounds.y - 3, bounds.width, bounds.height);
  expect(
    resolveDrawingMoveAlignment({ moving: [moving], objects: [moving, object] }).delta
  ).toEqual({ x: 4, y: 3 });
});
it('aligns mixed selections by aggregate bounds and preserves relative geometry', () => {
  const moving = allKinds.filter((object) => object.kind !== 'text');
  const bounds = getDrawingSelectionBounds(moving)!;
  const result = resolveDrawingMoveAlignment({
    moving,
    objects: moving,
    domBounds: [{ ...bounds, x: bounds.x - 4, y: bounds.y - 3 }],
  });
  expect(result.delta).toEqual({ x: -4, y: -3 });
  expect(
    getDrawingSelectionBounds(moving.map((object) => translateDrawingObject(object, result.delta)))
  ).toEqual({ ...bounds, x: bounds.x - 4, y: bounds.y - 3 });
});
