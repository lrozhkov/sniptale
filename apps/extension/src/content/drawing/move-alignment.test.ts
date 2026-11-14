import { expect, it } from 'vitest';
import {
  getDrawingSelectionBounds,
  resolveDrawingAlignmentFeedback,
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

it('retains every accepted same-coordinate center target and excludes a competing correction', () => {
  const moving = shape('moving', 104, 100, 20, 20);
  const result = resolveDrawingMoveAlignment({
    moving: [moving],
    objects: [
      shape('first', 100, 150, 20, 20),
      shape('second', 100, 180, 20, 20),
      shape('near', 99, 150, 20, 20),
    ],
  });
  const guide = result.guides.find((guide) => guide.axis === 'x' && guide.coordinate === 110);
  expect(result.delta.x).toBe(-4);
  expect(guide?.matches?.map((match) => match.target.id)).toEqual(['first', 'second']);
  expect(guide?.matches?.map((match) => match.anchor.point)).toEqual([
    { x: 110, y: 160 },
    { x: 110, y: 190 },
  ]);
  expect(guide?.from).toBe(92);
  expect(guide?.to).toBe(208);
});

it('keeps the previous eligible target only on equal distance and is stable under candidate ordering', () => {
  const moving = shape('moving', 100, 100, 20, 20);
  const left = shape('a', 94, 160, 20, 20);
  const right = shape('b', 106, 160, 20, 20);
  const initial = resolveDrawingMoveAlignment({ moving: [moving], objects: [right] });
  for (const objects of [
    [left, right],
    [right, left],
  ]) {
    expect(resolveDrawingMoveAlignment({ moving: [moving], objects }).delta.x).toBe(-6);
    expect(
      resolveDrawingMoveAlignment({ moving: [moving], objects, previousGuides: initial.guides })
        .delta.x
    ).toBe(6);
  }
  expect(
    resolveDrawingMoveAlignment({
      moving: [moving],
      objects: [left],
      previousGuides: initial.guides,
    }).delta.x
  ).toBe(-6);
  const closer = shape('closer', 99, 160, 20, 20);
  expect(
    resolveDrawingMoveAlignment({
      moving: [moving],
      objects: [right, closer],
      previousGuides: initial.guides,
    }).delta.x
  ).toBe(-1);
});

it.each(['x', 'y'] as const)(
  'preserves independent source and target center positions for %s-only acceptance',
  (axis) => {
    const moving = shape('moving', axis === 'x' ? 104 : 170, axis === 'y' ? 104 : 170, 20, 20);
    const result = resolveDrawingMoveAlignment({
      moving: [moving],
      objects: [shape('target', 100, 100, 20, 20)],
      axis,
    });
    expect(result.guides).toHaveLength(3);
    const match = result.guides.find((guide) => guide.matches?.[0]?.source.kind === 'center')
      ?.matches?.[0];
    expect(match?.source.kind).toBe('center');
    expect(match?.anchor.kind).toBe('center');
    expect(match?.source.point[axis]).toBe(match?.anchor.point[axis]);
    const perpendicular = axis === 'x' ? 'y' : 'x';
    expect(match?.source.point[perpendicular]).not.toBe(match?.anchor.point[perpendicular]);
  }
);

it('keeps exact coincident same-size page rectangles at rest with one filled center', () => {
  const moving = shape('moving', 100, 100, 100, 80);
  const result = resolveDrawingMoveAlignment({
    moving: [moving],
    objects: [moving, shape('peer', 100, 100, 100, 80)],
  });
  expect(result.delta).toEqual({ x: 0, y: 0 });
  expect(result.guides.map((guide) => [guide.axis, guide.coordinate])).toEqual([
    ['x', 150],
    ['x', 100],
    ['x', 200],
    ['y', 140],
    ['y', 100],
    ['y', 180],
  ]);
  expect(resolveDrawingAlignmentFeedback(result.guides).markers).toEqual([
    { x: 150, y: 140, filled: true },
  ]);
});

it.each([
  { axis: 'x', bounds: { x: 100, y: 250, width: 100, height: 120 } },
  { axis: 'y', bounds: { x: 280, y: 100, width: 140, height: 80 } },
] as const)(
  'keeps same-size $axis page alignment as a hollow center without full coincidence',
  ({ axis, bounds }) => {
    const moving = shape('moving', bounds.x, bounds.y, bounds.width, bounds.height);
    const result = resolveDrawingMoveAlignment({
      moving: [moving],
      objects: [moving, shape('peer', 100, 100, 100, 80)],
    });
    expect(result.guides.map((guide) => guide.axis)).toEqual([axis, axis, axis]);
    expect(
      result.guides
        .find((guide) => guide.matches?.[0]?.source.kind === 'center')
        ?.matches?.every(
          (match) => match.source.kind === 'center' && match.anchor.kind === 'center'
        )
    ).toBe(true);
    expect(resolveDrawingAlignmentFeedback(result.guides).markers).toEqual([
      { x: 150, y: 140, filled: false },
    ]);
  }
);

it('keeps the page center correspondence through the editor floating-point counterexample', () => {
  const peer = shape('peer', 200, 100, 100, 80);
  const first = resolveDrawingMoveAlignment({
    moving: [shape('moving', 200.01, 100, 100, 80)],
    objects: [peer],
  });
  const next = resolveDrawingMoveAlignment({
    moving: [shape('moving', 200.02, 100, 100, 80)],
    objects: [peer],
    previousGuides: first.guides,
  });
  expect(
    [first, next].map(
      (result) =>
        result.guides.find(
          (guide) => guide.axis === 'x' && guide.matches?.[0]?.source.kind === 'center'
        )?.coordinate
    )
  ).toEqual([250, 250]);
  expect(resolveDrawingAlignmentFeedback(next.guides).markers).toEqual([
    { x: 250, y: 140, filled: true },
  ]);
});

it('retains page target identity through sub-millipixel noise but releases it for a closer candidate', () => {
  const moving = shape('moving', 100, 100, 100, 80);
  const right = shape('right', 106, 100, 100, 80);
  const left = shape('left', 94.0001, 100, 100, 80);
  const previousGuides = resolveDrawingMoveAlignment({ moving: [moving], objects: [right] }).guides;
  for (const objects of [
    [left, right],
    [right, left],
  ]) {
    const result = resolveDrawingMoveAlignment({ moving: [moving], objects, previousGuides });
    expect(result.delta.x).toBe(6);
    expect(
      result.guides.find((guide) => guide.axis === 'x')?.matches?.map((match) => match.target.id)
    ).toEqual(['right']);
  }
  expect(
    resolveDrawingMoveAlignment({
      moving: [moving],
      objects: [right, shape('left', 94.002, 100, 100, 80)],
      previousGuides,
    }).delta.x
  ).toBeCloseTo(-5.998, 9);
});

it('prefers a full page center over a previous other-target edge with the same correction', () => {
  const moving = shape('moving', 100, 100, 100, 80);
  const edge = shape('old-edge', 100, 250, 40, 40);
  const center = shape('center-peer', 100, 100, 100, 80);
  const previousGuides = resolveDrawingMoveAlignment({ moving: [moving], objects: [edge] }).guides;
  const result = resolveDrawingMoveAlignment({
    moving: [moving],
    objects: [edge, center],
    previousGuides,
  });
  expect(result.delta).toEqual({ x: 0, y: 0 });
  expect(resolveDrawingAlignmentFeedback(result.guides).markers).toEqual([
    { x: 150, y: 140, filled: true },
  ]);
});

it.each([-1, 1])('keeps page admission at six CSS pixels for sign %s', (sign) => {
  const target = shape('peer', 100, 100, 100, 80);
  for (const pixels of [5.999999, 6, 6.000001]) {
    const moving = shape('moving', 100 + sign * pixels, 100, 100, 80);
    const result = resolveDrawingMoveAlignment({ moving: [moving], objects: [target] });
    expect(result.guides.filter((guide) => guide.axis === 'x')).toHaveLength(
      3 * Number(pixels <= 6)
    );
  }
});

it('accepts equal positive gaps from eligible drawing siblings beyond the point cutoff', () => {
  const moving = shape('moving', 396, 110, 40, 20);
  const objects = [shape('left', 100, 100, 100, 60), shape('right', 640, 100, 100, 60)];
  const result = resolveDrawingMoveAlignment({ moving: [moving], objects });
  expect(result.delta.x).toBe(4);
  expect(result.relations).toMatchObject([{ kind: 'gap', axis: 'x', value: 200 }]);
  expect(result.acceptedByAxis.x).toBe(result.relations[0]?.key);
  expect(result.guides.filter((guide) => guide.axis === 'x')).toEqual([]);
});

it.each(['x', 'y'] as const)(
  'repeats a neighbor gap on %s and reports every connected interval once',
  (axis) => {
    const box = (id: string, position: number, size: number) =>
      axis === 'x' ? shape(id, position, 110, size, 20) : shape(id, 110, position, 20, size);
    const result = resolveDrawingMoveAlignment({
      moving: [box('moving', 133, 10)],
      axis,
      objects: [box('a', 0, 20), box('b', 40, 30), box('c', 90, 20)],
    });
    expect(result.delta[axis]).toBe(-3);
    expect(
      result.relations.some((relation) => relation.kind === 'gap' && relation.spans.length === 3)
    ).toBe(true);
    expect(result.acceptedByAxis[axis]).toBeDefined();
    expect(result.acceptedByAxis[axis === 'x' ? 'y' : 'x']).toBeUndefined();
  }
);

it('retains the actual primary gap on a distance tie and replaces it when another correction is closer', () => {
  const moving = shape('moving', 396, 110, 40, 20);
  const left = shape('left', 100, 100, 100, 60),
    right = shape('right', 640, 100, 100, 60);
  const initial = resolveDrawingMoveAlignment({ moving: [moving], objects: [left, right] });
  const competing = shape('competing', 392, 90, 20, 20);
  const retained = resolveDrawingMoveAlignment({
    moving: [moving],
    objects: [competing, right, left],
    previousFeedback: initial,
  });
  expect(retained.delta.x).toBe(4);
  expect(retained.acceptedByAxis.x).toBe(initial.acceptedByAxis.x);
  const closer = resolveDrawingMoveAlignment({
    moving: [moving],
    objects: [{ ...competing, bounds: { ...competing.bounds, x: 394 } }, right, left],
    previousFeedback: initial,
  });
  expect(closer.delta.x).toBe(-2);
  expect(closer.acceptedByAxis.x).not.toBe(initial.acceptedByAxis.x);
});

it('does not use excluded or intervening relation targets', () => {
  const moving = shape('moving', 396, 110, 40, 20);
  const left = shape('left', 100, 100, 100, 60),
    right = shape('right', 640, 100, 100, 60);
  expect(
    resolveDrawingMoveAlignment({
      moving: [moving],
      objects: [left, right],
      relationObjects: [left],
    }).relations
  ).toEqual([]);
  const blocked = resolveDrawingMoveAlignment({
    moving: [moving],
    objects: [left, right, shape('between', 300, 110, 20, 20)],
  });
  expect(
    blocked.relations.filter((relation) => relation.kind === 'gap' && relation.value === 200)
  ).toEqual([]);
});

it.each(['row', 'column'] as const)(
  'S11 publishes both real edges and center for a same-size %s with one primary',
  (layout) => {
    const transpose = (object: Extract<DrawingObject, { kind: 'rectangle' }>) =>
      layout === 'row'
        ? object
        : {
            ...object,
            bounds: {
              x: object.bounds.y,
              y: object.bounds.x,
              width: object.bounds.height,
              height: object.bounds.width,
            },
          };
    const moving = transpose(shape('moving', 100, 104, 80, 60));
    const targets = [
      transpose(shape('left', 0, 100, 80, 60)),
      transpose(shape('right', 200, 100, 80, 60)),
    ];
    const axis = layout === 'row' ? 'y' : 'x';
    const first = resolveDrawingMoveAlignment({ moving: [moving], objects: targets, axis });
    expect(first.delta[axis]).toBe(-4);
    expect(first.guides.map((guide) => guide.coordinate)).toEqual([130, 100, 160]);
    for (const guide of first.guides) {
      expect(guide.axis).toBe(axis);
      expect(guide.matches?.map((match) => match.target.id).sort()).toEqual(['left', 'right']);
      expect(
        guide.matches?.every((match) => match.source.point[axis] === match.anchor.point[axis])
      ).toBe(true);
    }
    expect(Object.keys(first.acceptedByAxis)).toEqual([axis]);
    const next = resolveDrawingMoveAlignment({
      moving: [moving],
      objects: [...targets].reverse(),
      axis,
      previousFeedback: first,
    });
    expect(next.acceptedByAxis).toEqual(first.acceptedByAxis);
    expect(next.guides.map((guide) => guide.coordinate)).toEqual([130, 100, 160]);
    expect(resolveDrawingAlignmentFeedback(first.guides).markers).toHaveLength(2);
  }
);

it('S11 does not invent coincident edges for unequal heights sharing only their center', () => {
  const result = resolveDrawingMoveAlignment({
    moving: [shape('moving', 100, 104, 80, 60)],
    axis: 'y',
    objects: [shape('left', 0, 80, 80, 100), shape('right', 200, 80, 80, 100)],
  });
  expect(result.delta.y).toBe(-4);
  expect(result.guides.map((guide) => guide.coordinate)).toEqual([130]);
  expect(
    result.guides[0]?.matches?.every(
      (match) => match.source.kind === 'center' && match.anchor.kind === 'center'
    )
  ).toBe(true);
});
