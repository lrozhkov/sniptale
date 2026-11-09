import { expect, it } from 'vitest';
import { getDrawingObjectSelectionBounds, resolveDrawingMarqueeSelection } from './selection';
import type { DrawingObject } from './model';

const objects = [
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
] satisfies [DrawingObject, DrawingObject];

it('selects every object fully contained by the marquee', () => {
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

it.each([false, true])(
  'excludes large backgrounds, partial overlap and boundary contact (reversed: %s)',
  (reversed) => {
    const scene: DrawingObject[] = [
      { ...objects[0], id: 'background', bounds: { x: 0, y: 0, width: 200, height: 200 } },
      { ...objects[0], id: 'small-first', bounds: { x: 30, y: 30, width: 10, height: 10 } },
      { ...objects[0], id: 'partial', bounds: { x: 45, y: 35, width: 20, height: 10 } },
      { ...objects[0], id: 'touching', bounds: { x: 50, y: 35, width: 10, height: 10 } },
      { ...objects[0], id: 'exact', bounds: { x: 20, y: 20, width: 30, height: 30 } },
      { ...objects[1], id: 'small-last', bounds: { x: 25, y: 25, width: 5, height: 5 } },
    ];
    const start = { x: 20, y: 20 };
    const current = { x: 50, y: 50 };
    expect(
      resolveDrawingMarqueeSelection({
        current: reversed ? start : current,
        initialIds: [],
        mode: 'replace',
        objects: scene,
        start: reversed ? current : start,
      })
    ).toEqual(['small-first', 'exact', 'small-last']);
  }
);

it.each(['add', 'toggle'] as const)(
  'preserves partial selections and excludes new partials in %s mode',
  (mode) => {
    const scene: DrawingObject[] = [
      { ...objects[0], id: 'selected-partial', bounds: { x: 5, y: 20, width: 20, height: 10 } },
      { ...objects[0], id: 'contained', bounds: { x: 20, y: 20, width: 10, height: 10 } },
      { ...objects[0], id: 'new-partial', bounds: { x: 45, y: 20, width: 20, height: 10 } },
      { ...objects[0], id: 'outside', bounds: { x: 80, y: 80, width: 10, height: 10 } },
    ];
    expect(
      resolveDrawingMarqueeSelection({
        current: { x: 50, y: 50 },
        initialIds: ['outside', 'contained', 'selected-partial'],
        mode,
        objects: scene,
        start: { x: 10, y: 10 },
      })
    ).toEqual(
      mode === 'add'
        ? ['selected-partial', 'contained', 'outside']
        : ['selected-partial', 'outside']
    );
  }
);

it.each(['rectangle', 'ellipse', 'triangle', 'parallelogram'] as const)(
  'requires full transformed bounds for a rotated and skewed %s',
  (kind) => {
    const object: DrawingObject = {
      bounds: { x: 10, y: 10, width: 30, height: 20 },
      color: '#000000',
      id: 'transformed',
      kind,
      rotation: 35,
      skewX: 0.4,
      width: 2,
    };
    const bounds = getDrawingObjectSelectionBounds(object);
    const start = { x: bounds.x, y: bounds.y };
    const current = { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
    const gesture = { initialIds: [], mode: 'replace' as const, objects: [object], start };
    expect(resolveDrawingMarqueeSelection({ ...gesture, current })).toEqual(['transformed']);
    expect(resolveDrawingMarqueeSelection({ ...gesture, current: start, start: current })).toEqual([
      'transformed',
    ]);
    expect(
      resolveDrawingMarqueeSelection({ ...gesture, current: { ...current, x: current.x - 0.01 } })
    ).toEqual([]);
  }
);

it('allows only affine rounding at a contained boundary', () => {
  const gesture = {
    current: { x: 40 - 5e-7, y: 30 },
    initialIds: [],
    mode: 'replace' as const,
    objects: [objects[0]],
    start: { x: 10 + 5e-7, y: 10 },
  };
  expect(resolveDrawingMarqueeSelection(gesture)).toEqual(['one']);
  expect(resolveDrawingMarqueeSelection({ ...gesture, start: { x: 10 + 2e-6, y: 10 } })).toEqual(
    []
  );
});
