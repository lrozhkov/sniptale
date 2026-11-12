import { ActiveSelection, Group, Rect, type Canvas, type FabricObject } from 'fabric';
import { describe, expect, it, vi } from 'vitest';
import type { EditorMagnetAligningGuidelines } from './aligning-guidelines';
import { createEditorMagnetManager } from './manager';
import { getEditorMovePosition, resolveEditorMoveSnap, type EditorMoveEvent } from './move-axis';
import {
  resolveDrawingAlignmentFeedback,
  type DrawingBounds,
} from '../../../features/drawing/public';

function createRect(left = 100, top = 100) {
  const target = new Rect({ left, top, width: 20, height: 20, strokeWidth: 0 });
  target.sniptaleType = 'shape';
  target.isOnScreen = () => true;
  target.setCoords();
  return target;
}

function createManager(target: FabricObject, magnetEnabled: boolean) {
  const sibling = createRect(164, 104);
  const objects = [target, sibling];
  const canvas = {
    on: vi.fn(),
    off: vi.fn(),
    getZoom: () => 1,
    viewportTransform: [1, 0, 0, 1, 0, 0],
    forEachObject: (visit: (object: FabricObject) => void) => objects.forEach(visit),
  } as unknown as Canvas;
  objects.forEach((object) => {
    object.canvas = canvas;
  });
  return createEditorMagnetManager({
    canvas,
    getActiveTool: () => 'select',
    getCanvasDocumentSize: () => ({ width: 1000, height: 800 }),
    getCropGuide: () => null,
    getWorkspace: () => ({
      backgroundColor: '#fff',
      gridColor: '#ccc',
      gridEnabled: false,
      gridSnapEnabled: false,
      gridSize: 24,
      hideSelectionWhileDragging: true,
      magnetEnabled,
    }),
  }) as ReturnType<typeof createEditorMagnetManager> & EditorMagnetAligningGuidelines;
}

function event(target: FabricObject, x: number, y: number, shiftKey = true): EditorMoveEvent {
  return {
    target,
    e: { shiftKey },
    pointer: { x, y },
    transform: { action: 'drag', ex: 100, ey: 100, original: { left: 100, top: 100 } },
  };
}

describe('editor Shift movement', () => {
  it('chooses the dominant raw pointer axis instead of snapped target coordinates', () => {
    const target = createRect(100, 400);
    expect(getEditorMovePosition(event(target, 160, 109))).toEqual({
      left: 160,
      top: 100,
      lockedAxis: 'top',
    });
    expect(getEditorMovePosition(event(target, 109, 160))).toEqual({
      left: 100,
      top: 160,
      lockedAxis: 'left',
    });
  });

  it.each([false, true])(
    'constrains movement and restores raw two-axis position on release (magnet %s)',
    (enabled) => {
      const target = createRect(160, 109);
      const manager = createManager(target, enabled);
      const move = event(target, 160, 109);
      manager.moving(move as Parameters<typeof manager.moving>[0]);
      expect(target.top).toBe(100);
      expect(target.left).toBe(enabled ? 164 : 160);
      if (enabled) expect(manager.horizontalLines.size).toBe(0);
      const released = event(target, 220, 139, false);
      manager.moving(released as Parameters<typeof manager.moving>[0]);
      expect(target.left).toBe(220);
      expect(target.top).toBe(139);
    }
  );

  it.each([Group, ActiveSelection])(
    'moves an aggregate without changing its child geometry',
    (Aggregate) => {
      const target = new Aggregate([createRect(10, 20), createRect(40, 50)], {
        left: 100,
        top: 100,
      });
      const children = target.getObjects().map((child) => ({ left: child.left, top: child.top }));
      const manager = createManager(target, false);
      manager.moving(event(target, 109, 160) as Parameters<typeof manager.moving>[0]);
      expect(target.left).toBe(100);
      expect(target.top).toBe(160);
      expect(target.getObjects().map((child) => ({ left: child.left, top: child.top }))).toEqual(
        children
      );
    }
  );

  it('leaves creation and incomplete transforms unchanged', () => {
    expect(getEditorMovePosition({ target: createRect() })).toBeNull();
    const move = event(createRect(), 160, 109);
    if (move.transform) move.transform.action = 'scale';
    expect(getEditorMovePosition(move)).toBeNull();
  });
});

it('retains two independently preferred targets on equal-distance axes without altering the threshold', async () => {
  const { resolveEditorMoveSnap } = await import('./move-axis');
  const target = (id: string, x: number, y: number) => ({
    target: {
      id,
      kind: 'object' as const,
      bounds: { x: x - 10, y: y - 10, width: 20, height: 20 },
    },
    anchors: [{ kind: 'center' as const, point: { x, y } }],
  });
  const previous = resolveEditorMoveSnap({
    source: [{ kind: 'center', point: { x: 100, y: 100 } }],
    bounds: { x: 90, y: 90, width: 20, height: 20 },
    targets: [target('right', 106, 400), target('above', 400, 94)],
    threshold: 6,
    previous: { guides: [], relations: [], acceptedByAxis: {} },
  });
  const targets = [
    target('left', 94, 400),
    target('right', 106, 400),
    target('below', 400, 106),
    target('above', 400, 94),
  ];
  const args = {
    source: [{ kind: 'center' as const, point: { x: 100, y: 100 } }],
    bounds: { x: 90, y: 90, width: 20, height: 20 },
    targets,
    threshold: 6,
    previous,
  };
  const result = resolveEditorMoveSnap(args);
  expect(result.delta).toEqual({ x: 6, y: -6 });
  expect(resolveEditorMoveSnap({ ...args, targets: [...targets].reverse() }).delta).toEqual(
    result.delta
  );
  expect(resolveEditorMoveSnap({ ...args, threshold: 5.99 }).guides).toEqual([]);
  expect(resolveEditorMoveSnap({ ...args, lockedAxis: 'y' }).delta.y).toBe(0);
});

const identicalBounds = { x: 100, y: 100, width: 100, height: 80 };
function createOverlapMoveInput(
  bounds: DrawingBounds = identicalBounds,
  peers = [{ id: 'peer', bounds: identicalBounds }]
) {
  const rectangle = (bounds: DrawingBounds) => {
    const object = new Rect({
      left: bounds.x,
      top: bounds.y,
      width: bounds.width,
      height: bounds.height,
      originX: 'left',
      originY: 'top',
      strokeWidth: 0,
    });
    object.setCoords();
    return object;
  };
  const source = rectangle(bounds);
  const box = source.getBoundingRect();
  return {
    source: [
      ...source.getCoords().map((point) => ({ kind: 'edge' as const, point })),
      { kind: 'center' as const, point: source.getCenterPoint() },
    ],
    bounds: { x: box.left, y: box.top, width: box.width, height: box.height },
    targets: peers.map((peer) => {
      const object = rectangle(peer.bounds);
      const box = object.getBoundingRect();
      return {
        target: {
          id: peer.id,
          kind: 'object' as const,
          bounds: { x: box.left, y: box.top, width: box.width, height: box.height },
        },
        anchors: [
          ...object.getCoords().map((point) => ({ kind: 'point' as const, point })),
          { kind: 'center' as const, point: object.getCenterPoint() },
        ],
      };
    }),
    threshold: 6,
    previous: { guides: [], relations: [], acceptedByAxis: {} },
  };
}

describe('canonical same-size overlap', () => {
  it('keeps exact coincident rectangles at rest and reports one filled common center', () => {
    const result = resolveEditorMoveSnap(createOverlapMoveInput());
    expect(result.delta).toEqual({ x: 0, y: 0 });
    expect(resolveDrawingAlignmentFeedback(result.guides).markers).toEqual([
      { x: 150, y: 140, filled: true },
    ]);
    expect(result.guides.map((guide) => [guide.axis, guide.coordinate])).toEqual([
      ['x', 150],
      ['x', 100],
      ['x', 200],
      ['y', 140],
      ['y', 100],
      ['y', 180],
    ]);
  });

  it.each([
    { axis: 'x', bounds: { x: 100, y: 250, width: 100, height: 120 } },
    { axis: 'y', bounds: { x: 280, y: 100, width: 140, height: 80 } },
  ] as const)(
    'uses the center for an equal-size $axis axis without inventing full centering',
    ({ axis, bounds }) => {
      const result = resolveEditorMoveSnap(createOverlapMoveInput(bounds));
      expect(result.guides.map((guide) => [guide.axis, guide.coordinate])).toEqual(
        (axis === 'x' ? [150, 100, 200] : [140, 100, 180]).map((coordinate) => [axis, coordinate])
      );
      expect(
        result.guides
          .find((guide) => guide.coordinate === (axis === 'x' ? 150 : 140))
          ?.matches?.every(
            (match) => match.source.kind === 'center' && match.anchor.kind === 'center'
          )
      ).toBe(true);
      expect(resolveDrawingAlignmentFeedback(result.guides).markers).toEqual([
        { x: 150, y: 140, filled: false },
      ]);
    }
  );

  it('keeps the same canonical correspondence when anchor enumeration reverses', () => {
    const args = createOverlapMoveInput();
    const normal = resolveEditorMoveSnap(args);
    const reversed = resolveEditorMoveSnap({
      ...args,
      source: [...args.source].reverse(),
      targets: args.targets.map((target) => ({
        ...target,
        anchors: [...target.anchors].reverse(),
      })),
    });
    expect(normal.guides.map((guide) => [guide.axis, guide.coordinate])).toEqual(
      reversed.guides.map((guide) => [guide.axis, guide.coordinate])
    );
    expect(resolveDrawingAlignmentFeedback(normal.guides).markers).toEqual([
      { x: 150, y: 140, filled: true },
    ]);
  });

  it('does not switch opposite edges from actual Fabric floating-point noise within one target history', () => {
    const target = { x: 200, y: 100, width: 100, height: 80 };
    const first = resolveEditorMoveSnap(
      createOverlapMoveInput({ ...target, x: 200.01 }, [{ id: 'peer', bounds: target }])
    );
    const next = resolveEditorMoveSnap({
      ...createOverlapMoveInput({ ...target, x: 200.02 }, [{ id: 'peer', bounds: target }]),
      previous: first,
    });
    expect(
      [first, next].map(
        (result) =>
          result.guides.find(
            (guide) =>
              guide.axis === 'x' &&
              guide.matches?.some(
                (match) => match.source.kind === 'center' && match.anchor.kind === 'center'
              )
          )?.coordinate
      )
    ).toEqual([250, 250]);
    expect(resolveDrawingAlignmentFeedback(next.guides).markers).toEqual([
      { x: 250, y: 140, filled: true },
    ]);
  });

  it('retains the previous target through sub-millipixel distance noise and reversed candidate order', () => {
    const right = { id: 'right', bounds: { ...identicalBounds, x: 106 } };
    const left = { id: 'left', bounds: { ...identicalBounds, x: 94.0001 } };
    const previous = resolveEditorMoveSnap(createOverlapMoveInput(identicalBounds, [right]));
    for (const peers of [
      [left, right],
      [right, left],
    ]) {
      const result = resolveEditorMoveSnap({
        ...createOverlapMoveInput(identicalBounds, peers),
        previous,
      });
      expect(result.delta.x).toBe(6);
      expect([
        ...new Set(
          result.guides
            .filter((guide) => guide.axis === 'x')
            .flatMap((guide) => guide.matches?.map((match) => match.target.id) ?? [])
        ),
      ]).toEqual(['right']);
    }
  });

  it('still chooses a materially closer candidate outside the existing content tie tolerance', () => {
    const right = { id: 'right', bounds: { ...identicalBounds, x: 106 } };
    const left = { id: 'left', bounds: { ...identicalBounds, x: 94.002 } };
    const previous = resolveEditorMoveSnap(createOverlapMoveInput(identicalBounds, [right]));
    const result = resolveEditorMoveSnap({
      ...createOverlapMoveInput(identicalBounds, [right, left]),
      previous,
    });
    expect(result.delta.x).toBeCloseTo(-5.998, 9);
  });
});

it('prefers a full center over a previous other-target edge requesting the same correction', () => {
  const edge = { id: 'old-edge', bounds: { x: 100, y: 250, width: 40, height: 40 } };
  const center = { id: 'center-peer', bounds: identicalBounds };
  const previous = resolveEditorMoveSnap(createOverlapMoveInput(identicalBounds, [edge]));
  const result = resolveEditorMoveSnap({
    ...createOverlapMoveInput(identicalBounds, [edge, center]),
    previous,
  });
  expect(result.delta).toEqual({ x: 0, y: 0 });
  expect(resolveDrawingAlignmentFeedback(result.guides).markers).toEqual([
    { x: 150, y: 140, filled: true },
  ]);
});

it('preserves explicit arrow point and axis-only center marker semantics', () => {
  const target = {
    id: 'point-target',
    kind: 'object' as const,
    bounds: { x: 100, y: 100, width: 0, height: 0 },
  };
  const exact = resolveEditorMoveSnap({
    source: [{ kind: 'point', point: { x: 104, y: 103 } }],
    bounds: { x: 104, y: 103, width: 0, height: 0 },
    targets: [{ target, anchors: [{ kind: 'point', point: { x: 100, y: 100 } }] }],
    threshold: 6,
    previous: { guides: [], relations: [], acceptedByAxis: {} },
  });
  expect(exact.delta).toEqual({ x: -4, y: -3 });
  expect(resolveDrawingAlignmentFeedback(exact.guides).markers).toEqual([
    { x: 100, y: 100, filled: true },
  ]);
  const axis = resolveEditorMoveSnap({
    source: [{ kind: 'point', point: { x: 104, y: 140 } }],
    bounds: { x: 104, y: 140, width: 0, height: 0 },
    targets: [{ target, anchors: [{ kind: 'center', point: { x: 100, y: 100 } }] }],
    threshold: 6,
    previous: { guides: [], relations: [], acceptedByAxis: {} },
  });
  expect(axis.guides.map((guide) => guide.axis)).toEqual(['x']);
  expect(resolveDrawingAlignmentFeedback(axis.guides).markers).toEqual([
    { x: 100, y: 100, filled: false },
  ]);
});

it.each([0.25, 1, 2])('normalizes numerical distance ties to CSS pixels at scale %s', (scale) => {
  const threshold = 6 / scale;
  const peer = (id: string, x: number) => ({
    target: { id, kind: 'object' as const, bounds: { x: x - 10, y: 990, width: 20, height: 20 } },
    anchors: [{ kind: 'center' as const, point: { x, y: 1000 } }],
  });
  const args = {
    source: [{ kind: 'center' as const, point: { x: 0, y: 0 } }],
    bounds: { x: -10, y: -10, width: 20, height: 20 },
    threshold,
    previous: { guides: [], relations: [], acceptedByAxis: {} },
  };
  for (const sign of [-1, 1]) {
    const prior = peer('prior', sign * threshold);
    const near = peer('near', -sign * (threshold - 0.0005 / scale));
    const previous = resolveEditorMoveSnap({ ...args, targets: [prior] });
    for (const targets of [
      [near, prior],
      [prior, near],
    ])
      expect(resolveEditorMoveSnap({ ...args, previous, targets }).delta.x).toBe(sign * threshold);
    const closer = peer('closer', -sign * (threshold - 0.002 / scale));
    expect(
      resolveEditorMoveSnap({ ...args, previous, targets: [prior, closer] }).delta.x
    ).toBeCloseTo(-sign * (threshold - 0.002 / scale), 9);
  }
});

it.each([0.25, 1, 2])(
  'does not widen the six CSS pixel admission threshold at scale %s',
  (scale) => {
    for (const sign of [-1, 1])
      for (const pixels of [5.999999, 6, 6.000001]) {
        const x = (sign * pixels) / scale;
        const result = resolveEditorMoveSnap({
          source: [{ kind: 'point', point: { x: 0, y: 0 } }],
          bounds: { x: 0, y: 0, width: 0, height: 0 },
          threshold: 6 / scale,
          previous: { guides: [], relations: [], acceptedByAxis: {} },
          targets: [
            {
              target: {
                id: 'endpoint',
                kind: 'object',
                bounds: { x, y: 1000, width: 0, height: 0 },
              },
              anchors: [{ kind: 'point', point: { x, y: 1000 } }],
            },
          ],
        });
        expect(result.guides).toHaveLength(Number(pixels <= 6));
        expect(result.delta.x).toBe(pixels <= 6 ? x : 0);
      }
  }
);

function gapMove(x: number, y = 5, transpose = false) {
  const bounds = (x: number, y: number, width: number, height: number) =>
    transpose ? { x: y, y: x, width: height, height: width } : { x, y, width, height };
  return {
    sourceId: 'S',
    source: [],
    bounds: bounds(x, y, 40, 10),
    threshold: 6,
    previous: { guides: [], relations: [], acceptedByAxis: {} },
    targets: [
      { target: { id: 'A', kind: 'object' as const, bounds: bounds(0, 0, 20, 20) }, anchors: [] },
      { target: { id: 'B', kind: 'object' as const, bounds: bounds(100, 0, 30, 20) }, anchors: [] },
    ],
  };
}

it.each([false, true])('accepts equal center gaps on either axis (transpose %s)', (transpose) => {
  const result = resolveEditorMoveSnap(gapMove(35, 5, transpose));
  const axis = transpose ? 'y' : 'x';
  expect(result.delta[axis]).toBe(5);
  expect(result.guides).toEqual([]);
  expect(result.relations).toMatchObject([{ kind: 'gap', axis, value: 20 }]);
  expect(result.acceptedByAxis[axis]).toBe(result.relations[0]?.key);
  expect(
    resolveEditorMoveSnap({ ...gapMove(35, 5, transpose), lockedAxis: axis }).relations
  ).toEqual([]);
});

it('arbitrates a closer point against a gap and never retains a displayed loser as primary', () => {
  const args = gapMove(35);
  const pointTarget = {
    target: {
      id: 'point',
      kind: 'object' as const,
      bounds: { x: 39, y: 300, width: 0, height: 0 },
    },
    anchors: [{ kind: 'point' as const, point: { x: 39, y: 300 } }],
  };
  const source = [{ kind: 'point' as const, point: { x: 35, y: 5 } }];
  const winner = resolveEditorMoveSnap({
    ...args,
    source,
    targets: [...args.targets, pointTarget],
  });
  expect(winner.delta.x).toBe(4);
  expect(winner.relations).toEqual([]);
  expect(winner.acceptedByAxis.x).toContain('point');
  const gapWinner = resolveEditorMoveSnap({
    ...args,
    source,
    targets: [
      ...args.targets,
      { ...pointTarget, anchors: [{ kind: 'point', point: { x: 41, y: 300 } }] },
    ],
  });
  expect(gapWinner.delta.x).toBe(5);
  expect(gapWinner.relations).toHaveLength(1);
  expect(gapWinner.acceptedByAxis.x).toBe(gapWinner.relations[0]?.key);
});

it('keeps a primary gap key on a tie but chooses a materially closer point', () => {
  const args = gapMove(35);
  const previous = resolveEditorMoveSnap(args);
  const target = (x: number) => ({
    target: { id: 'point', kind: 'object' as const, bounds: { x, y: 300, width: 0, height: 0 } },
    anchors: [{ kind: 'point' as const, point: { x, y: 300 } }],
  });
  const next = (x: number) =>
    resolveEditorMoveSnap({
      ...args,
      previous,
      source: [{ kind: 'point', point: { x: 35, y: 5 } }],
      targets: [...args.targets, target(x)],
    });
  expect(next(40).acceptedByAxis.x).toBe(previous.acceptedByAxis.x);
  expect(next(39.99).relations).toEqual([]);
});

it('rejects a gap whose perpendicular band is lost after the other axis correction', () => {
  const args = gapMove(35, 19);
  const result = resolveEditorMoveSnap({
    ...args,
    source: [{ kind: 'point', point: { x: 35, y: 19 } }],
    targets: [
      ...args.targets,
      {
        target: { id: 'point', kind: 'object', bounds: { x: 300, y: 24, width: 0, height: 0 } },
        anchors: [{ kind: 'point', point: { x: 300, y: 24 } }],
      },
    ],
  });
  expect(result.delta).toEqual({ x: 0, y: 5 });
  expect(result.relations).toEqual([]);
  expect(result.acceptedByAxis.x).toBeUndefined();
});

it.each([false, true])(
  'accepts repeated adjacent gaps in either axis (transpose %s)',
  (transpose) => {
    const args = gapMove(86, 5, transpose);
    args.bounds = transpose
      ? { x: 5, y: 86, width: 10, height: 30 }
      : { x: 86, y: 5, width: 30, height: 10 };
    args.targets[1]!.target.bounds = transpose
      ? { x: 0, y: 40, width: 20, height: 30 }
      : { x: 40, y: 0, width: 30, height: 20 };
    const result = resolveEditorMoveSnap(args);
    const axis = transpose ? 'y' : 'x';
    expect(result.delta[axis]).toBe(4);
    expect(result.relations).toMatchObject([{ kind: 'gap', mode: 'repeat', axis, value: 20 }]);
    expect(
      resolveEditorMoveSnap({ ...args, targets: [...args.targets].reverse() }).acceptedByAxis
    ).toEqual(result.acceptedByAxis);
  }
);

it.each([
  {
    name: 'equal-height row',
    peer: { x: 300, y: 100, width: 140, height: 80 },
    axis: 'y' as const,
    coordinates: [140, 100, 180],
  },
  {
    name: 'equal-width column',
    peer: { x: 100, y: 300, width: 100, height: 140 },
    axis: 'x' as const,
    coordinates: [150, 100, 200],
  },
])(
  'shows all actual coincident edges and center for an $name using one correction',
  ({ peer, axis, coordinates }) => {
    const input = createOverlapMoveInput(identicalBounds, [{ id: 'peer', bounds: peer }]);
    const result = resolveEditorMoveSnap(input);
    expect(result.delta).toEqual({ x: 0, y: 0 });
    expect(result.guides.map((guide) => [guide.axis, guide.coordinate])).toEqual(
      coordinates.map((coordinate) => [axis, coordinate])
    );
    const centerOnly = resolveEditorMoveSnap({
      ...input,
      targets: input.targets.map((target) => ({
        ...target,
        anchors: target.anchors.filter((anchor) => anchor.kind === 'center'),
      })),
    });
    expect(result.acceptedByAxis).toEqual(centerOnly.acceptedByAxis);
    expect(resolveDrawingAlignmentFeedback(result.guides).markers).toEqual([
      { x: peer.x + peer.width / 2, y: peer.y + peer.height / 2, filled: false },
    ]);
  }
);

it('does not explain an edge or center that needs a different signed correction', () => {
  const result = resolveEditorMoveSnap(
    createOverlapMoveInput(identicalBounds, [
      { id: 'peer', bounds: { x: 300, y: 100, width: 140, height: 82 } },
    ])
  );
  expect(result.delta).toEqual({ x: 0, y: 0 });
  expect(result.guides.map((guide) => [guide.axis, guide.coordinate])).toEqual([['y', 100]]);
  expect(resolveDrawingAlignmentFeedback(result.guides).markers).toEqual([]);
});

it('keeps an actual edge confirmation when an equal-gap relation wins the same signed correction', () => {
  const result = resolveEditorMoveSnap(
    createOverlapMoveInput({ x: 35, y: 5, width: 40, height: 10 }, [
      { id: 'A', bounds: { x: 0, y: 0, width: 20, height: 20 } },
      { id: 'B', bounds: { x: 100, y: 0, width: 30, height: 20 } },
      { id: 'C', bounds: { x: 40, y: 300, width: 60, height: 20 } },
    ])
  );
  expect(result.delta).toEqual({ x: 5, y: 0 });
  expect(result.relations).toMatchObject([{ kind: 'gap', axis: 'x', value: 20 }]);
  expect(result.acceptedByAxis.x).toBe(result.relations[0]?.key);
  expect(
    result.guides.filter((guide) => guide.axis === 'x').map((guide) => guide.coordinate)
  ).toEqual([40]);
  expect(
    result.guides
      .find((guide) => guide.axis === 'x')
      ?.matches?.every(
        (match) => match.target.id === 'C' && match.source.point.x === match.anchor.point.x
      )
  ).toBe(true);
});

it('withdraws supplemental edge feedback when the winning gap loses its final perpendicular band', () => {
  const result = resolveEditorMoveSnap(
    createOverlapMoveInput({ x: 35, y: 19, width: 40, height: 10 }, [
      { id: 'A', bounds: { x: 0, y: 0, width: 20, height: 20 } },
      { id: 'B', bounds: { x: 100, y: 0, width: 30, height: 20 } },
      { id: 'C', bounds: { x: 40, y: 300, width: 60, height: 20 } },
    ])
  );
  expect(result.delta).toEqual({ x: 0, y: 1 });
  expect(result.relations).toEqual([]);
  expect(result.acceptedByAxis.x).toBeUndefined();
  expect(result.guides.filter((guide) => guide.axis === 'x')).toEqual([]);
});
