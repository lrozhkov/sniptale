// @vitest-environment jsdom
import { Canvas, Group, Point, Rect, util, type FabricObject, type Transform } from 'fabric';
import { expect, it } from 'vitest';
import { applyEditorBoxResizeSnap, resolveEditorRectResizeSnap } from './resize';
import type { EditorSnapTarget } from './move-axis';
import type { DrawingSnapFeedback } from '../../../features/drawing/public';
import type { EditorMagnetTransformEvent } from './aligning-guidelines';

function rectangle(id: string, left: number, top: number, width: number, height: number) {
  const object = new Rect({
    left,
    top,
    width,
    height,
    originX: 'left',
    originY: 'top',
    strokeWidth: 0,
  });
  object.sniptaleId = id;
  object.sniptaleType = 'shape';
  object.setCoords();
  return object;
}

function describe(object: FabricObject): EditorSnapTarget {
  const bounds = object.getBoundingRect();
  return {
    target: {
      id: object.sniptaleId!,
      kind: 'object',
      bounds: { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height },
    },
    anchors: [
      ...object.getCoords().map((point) => ({ kind: 'point' as const, point })),
      { kind: 'center', point: object.getCenterPoint() },
    ],
  };
}

function externalInput(
  direction: Parameters<typeof resolveEditorRectResizeSnap>[0]['direction'] = 'e',
  width = 84,
  height = 44
) {
  const object = rectangle('reference', 400, 420, width, height);
  const previous: DrawingSnapFeedback = { guides: [], relations: [], acceptedByAxis: {} };
  return {
    direction,
    minimumSize: 8,
    rect: { x: 100, y: 120, width: 80, height: 40 },
    sourceId: 'frame',
    targets: [{ object, description: describe(object) }],
    previous,
    threshold: 6,
  };
}

function gesture(
  target: FabricObject,
  corner = 'mr',
  centered = false,
  proportional = false
): EditorMagnetTransformEvent {
  const originX =
    centered || !/[lr]/.test(corner) ? 'center' : corner.includes('r') ? 'left' : 'right';
  const originY =
    centered || !/[tb]/.test(corner) ? 'center' : corner.includes('b') ? 'top' : 'bottom';
  const transform: Transform = {
    target,
    corner,
    action: corner.length === 2 ? 'scale' : /[lr]/.test(corner) ? 'scaleX' : 'scaleY',
    originX,
    originY,
    scaleX: target.scaleX,
    scaleY: target.scaleY,
    skewX: target.skewX,
    skewY: target.skewY,
    offsetX: 0,
    offsetY: 0,
    ex: 0,
    ey: 0,
    lastX: 0,
    lastY: 0,
    theta: util.degreesToRadians(target.angle),
    width: target.width,
    height: target.height,
    shiftKey: !proportional,
    altKey: centered,
    original: { ...util.saveObjectTransform(target), originX, originY },
    actionPerformed: true,
  };
  return {
    target,
    transform,
    pointer: new Point(),
    e: new MouseEvent('mousemove', { shiftKey: !proportional, ctrlKey: centered }),
  };
}

it.each(['e', 'w', 'n', 's', 'ne', 'nw', 'se', 'sw'] as const)(
  'matches unaligned external dimensions while keeping opposite %s edges fixed',
  (direction) => {
    const input = externalInput(direction);
    const result = resolveEditorRectResizeSnap(input);
    expect(result.rect.width).toBe(/[ew]/.test(direction) ? 84 : 80);
    expect(result.rect.height).toBe(/[ns]/.test(direction) ? 44 : 40);
    expect(result.rect.x).toBe(direction.includes('w') ? 96 : 100);
    expect(result.rect.y).toBe(direction.includes('n') ? 116 : 120);
    expect(result.feedback.guides).toEqual([]);
    expect(result.feedback.relations).toHaveLength(direction.length);
  }
);

it.each([0.25, 1, 2])('keeps external dimension admission at six CSS pixels at zoom%s', (zoom) => {
  for (const pixels of [6, 6.01]) {
    const input = externalInput('e', 80 + pixels / zoom, 100);
    input.threshold = 6 / zoom;
    const result = resolveEditorRectResizeSnap(input);
    expect(result.rect.width).toBeCloseTo(pixels <= 6 ? input.targets[0]!.object.width : 80, 8);
    expect(result.feedback.relations).toHaveLength(Number(pixels <= 6));
  }
});

it('rejects external dimension and point proposals below minimum before applying either', () => {
  const input = externalInput('e', 5, 100);
  input.rect = { x: 100, y: 120, width: 8, height: 40 };
  const point = rectangle('point', 105, 500, 0, 0);
  input.targets.push({ object: point, description: describe(point) });
  const result = resolveEditorRectResizeSnap(input);
  expect(result.rect).toEqual(input.rect);
  expect(result.feedback).toEqual({ guides: [], relations: [], acceptedByAxis: {} });
});

it('chooses one external point or dimension correction from the raw rectangle', () => {
  for (const x of [183, 185]) {
    const input = externalInput('e', 84, 100);
    const point = rectangle('point', x, 500, 0, 0);
    input.targets.push({ object: point, description: describe(point) });
    const result = resolveEditorRectResizeSnap(input);
    expect(result.rect.width).toBe(x === 183 ? 83 : 84);
    expect(result.feedback.relations).toHaveLength(Number(x === 185));
    expect(result.feedback.guides).toHaveLength(Number(x === 183));
  }
});

it('retains the external primary relation on an equal point correction and includes all size matches', () => {
  const input = externalInput('e', 84, 100);
  const initial = resolveEditorRectResizeSnap(input);
  input.previous = initial.feedback;
  const extra = rectangle('extra', 700, 600, 84, 96);
  const point = rectangle('point', 184, 500, 0, 0);
  input.targets.push(
    { object: extra, description: describe(extra) },
    { object: point, description: describe(point) }
  );
  const result = resolveEditorRectResizeSnap(input);
  expect(result.feedback.acceptedByAxis.x).toBe(initial.feedback.acceptedByAxis.x);
  const relation = result.feedback.relations[0];
  expect(relation?.kind).toBe('dimension');
  if (relation?.kind === 'dimension') expect(relation.targetSpans).toHaveLength(2);
  expect(result.feedback.guides).toHaveLength(1);
});

it('distinguishes unsupported native controls from a supported no-snap result', () => {
  const source = rectangle('source', 100, 120, 80, 40);
  const input = {
    event: gesture(source),
    sourceId: 'source',
    targets: [],
    threshold: 6,
    previous: { guides: [], relations: [], acceptedByAxis: {} },
  };
  expect(applyEditorBoxResizeSnap(input)).toEqual({
    guides: [],
    relations: [],
    acceptedByAxis: {},
  });
  source.sniptaleType = 'text';
  expect(applyEditorBoxResizeSnap(input)).toBeNull();
});

it('applies native correction in a rotated parent when the actual child box is scene aligned', async () => {
  const canvas = new Canvas(document.createElement('canvas'), { width: 1000, height: 800 });
  const source = rectangle('source', 100, 120, 80, 40);
  const reference = rectangle('reference', 400, 420, 82, 96);
  source.angle = -30;
  reference.angle = -30;
  const parent = new Group([source, reference], { angle: 30, scaleX: 2, scaleY: 2 });
  parent.sniptaleType = 'group';
  canvas.add(parent);
  source.setCoords();
  reference.setCoords();
  const fixed = source
    .getPositionByOrigin('left', 'center')
    .transform(parent.calcTransformMatrix());
  try {
    const feedback = applyEditorBoxResizeSnap({
      event: gesture(source),
      sourceId: 'source',
      targets: [{ object: reference, description: describe(reference) }],
      threshold: 6,
      previous: { guides: [], relations: [], acceptedByAxis: {} },
    });
    expect(source.getBoundingRect().width).toBeCloseTo(164, 8);
    expect(
      source
        .getPositionByOrigin('left', 'center')
        .transform(parent.calcTransformMatrix())
        .distanceFrom(fixed)
    ).toBeLessThan(1e-8);
    expect(feedback?.relations).toHaveLength(1);
  } finally {
    await canvas.dispose();
  }
});

function nativePair(width = 84, height = 96) {
  const source = rectangle('source', 100, 120, 80, 40);
  const reference = rectangle('reference', 400, 420, width, height);
  const targets: FabricObject[] = [reference];
  const canvas = new Canvas(document.createElement('canvas'), { width: 1000, height: 800 });
  source.canvas = canvas;
  reference.canvas = canvas;
  return {
    source,
    reference,
    canvas,
    targets,
    apply: (event: EditorMagnetTransformEvent) =>
      applyEditorBoxResizeSnap({
        event,
        sourceId: 'source',
        targets: targets.map((object) => ({ object, description: describe(object) })),
        threshold: 6 / canvas.getZoom(),
        previous: { guides: [], relations: [], acceptedByAxis: {} },
      }),
    dispose: () => {
      void canvas.dispose();
    },
  };
}

it.each(['ml', 'mr', 'mt', 'mb', 'tl', 'tr', 'bl', 'br'])(
  'preserves the native fixed anchor for a %s dimension match',
  (corner) => {
    const horizontal = /[lr]/.test(corner);
    const { source, apply, dispose } = nativePair(horizontal ? 84 : 190, horizontal ? 96 : 44);
    const event = gesture(source, corner);
    const fixed = source.getPositionByOrigin(event.transform.originX, event.transform.originY);
    apply(event);
    expect(
      source
        .getPositionByOrigin(event.transform.originX, event.transform.originY)
        .distanceFrom(fixed)
    ).toBeLessThan(1e-8);
    expect(
      horizontal ? source.getBoundingRect().width : source.getBoundingRect().height
    ).toBeCloseTo(horizontal ? 84 : 44, 8);
    dispose();
  }
);

it.each([0.25, 1, 2])(
  'uses centered handle displacement at zoom%s, including the exact six pixel boundary',
  (zoom) => {
    for (const centered of [false, true])
      for (const pixels of [6, 6.01]) {
        const width = 80 + (pixels / zoom) * (centered ? 2 : 1);
        const { source, apply, dispose, canvas } = nativePair(width);
        Object.assign(canvas, { getZoom: () => zoom, viewportTransform: [zoom, 0, 0, zoom, 0, 0] });
        const event = gesture(source, 'mr', centered);
        const before = source.getPositionByOrigin(event.transform.originX, event.transform.originY);
        const feedback = apply(event);
        expect(source.getBoundingRect().width).toBeCloseTo(pixels <= 6 ? width : 80, 8);
        expect(
          source
            .getPositionByOrigin(event.transform.originX, event.transform.originY)
            .distanceFrom(before)
        ).toBeLessThan(1e-8);
        expect(feedback!.relations).toHaveLength(Number(pixels <= 6));
        dispose();
      }
  }
);

it('chooses one feasible proportional scalar and preserves both native scale ratios', () => {
  const { source, apply, dispose } = nativePair(84, 44);
  const fixed = source.getPositionByOrigin('left', 'top');
  const feedback = apply(gesture(source, 'br', false, true));
  expect(source.getBoundingRect().width).toBeCloseTo(84, 8);
  expect(source.getBoundingRect().height).toBeCloseTo(42, 8);
  expect(source.scaleX).toBeCloseTo(source.scaleY, 9);
  expect(source.getPositionByOrigin('left', 'top')).toEqual(fixed);
  expect(feedback!.relations).toHaveLength(1);
  dispose();
});

it('rejects locked and minimum-scale corrections without leaving rejected geometry', () => {
  const { source, apply, dispose, reference } = nativePair(75);
  source.set({ width: 100, scaleX: 0.8, minScaleLimit: 0.78 });
  source.setCoords();
  const raw = source.getBoundingRect();
  let feedback = apply(gesture(source));
  expect(source.getBoundingRect()).toEqual(raw);
  expect(feedback!.guides.length > 0 || feedback!.relations.length > 0).toBe(false);
  reference.set({ width: 84 });
  reference.setCoords();
  source.lockScalingX = true;
  feedback = apply(gesture(source));
  expect(source.getBoundingRect()).toEqual(raw);
  expect(feedback!.guides.length > 0 || feedback!.relations.length > 0).toBe(false);
  dispose();
});

it('keeps the fixed scene anchor while scaling a child in a scaled parent', () => {
  const { source, reference, apply, dispose, canvas } = nativePair(164);
  const parent = new Group([source, reference], { scaleX: 2, scaleY: 2 });
  parent.sniptaleType = 'group';
  if (source.canvas) parent.canvas = source.canvas;
  reference.set({ width: 82 });
  parent.setCoords();
  source.setCoords();
  reference.setCoords();
  Object.assign(canvas, {
    forEachObject: (visit: (object: FabricObject) => void) => visit(parent),
  });
  const event = gesture(source);
  const fixed = source
    .getPositionByOrigin('left', 'center')
    .transform(parent.calcTransformMatrix());
  apply(event);
  expect(source.getBoundingRect().width).toBeCloseTo(164, 8);
  expect(
    source
      .getPositionByOrigin('left', 'center')
      .transform(parent.calcTransformMatrix())
      .distanceFrom(fixed)
  ).toBeLessThan(1e-8);
  dispose();
});

it.each([false, true])(
  'matches actual stroke-inclusive geometry (uniform stroke %s)',
  (strokeUniform) => {
    const { source, reference, apply, dispose } = nativePair();
    source.set({ strokeWidth: 4, strokeUniform, scaleX: 1.2 });
    source.setCoords();
    reference.set({ width: source.getBoundingRect().width + 3 });
    reference.setCoords();
    const feedback = apply(gesture(source));
    expect(source.getBoundingRect().width).toBeCloseTo(reference.getBoundingRect().width, 8);
    expect(feedback!.relations).toHaveLength(1);
    dispose();
  }
);

it('returns every matching dimension target using their actual unaligned spans', () => {
  const { source, reference, apply, dispose, targets } = nativePair();
  const extra = rectangle('extra', 700, 600, 84, 97);
  extra.sniptaleId = 'extra';
  if (reference.canvas) extra.canvas = reference.canvas;
  targets.push(extra);
  const feedback = apply(gesture(source));
  const relation = feedback?.relations[0];
  expect(relation?.kind).toBe('dimension');
  if (relation?.kind === 'dimension') expect(relation.targetSpans).toHaveLength(2);
  dispose();
});

it('does not add dimension relations to text, endpoint, rotated or skewed controls', () => {
  for (const mode of ['text', 'endpoint', 'rotated', 'skewed']) {
    const { source, apply, dispose } = nativePair();
    if (mode === 'text') source.sniptaleType = 'text';
    if (mode === 'endpoint')
      source.controls = { start: source.controls['mr']!, end: source.controls['ml']! };
    if (mode === 'rotated') source.angle = 30;
    if (mode === 'skewed') source.skewX = 12;
    source.setCoords();
    const feedback = apply(gesture(source));
    expect(feedback?.relations ?? []).toEqual([]);
    dispose();
  }
});

it('keeps side resize independent even while corner proportional scaling is enabled', () => {
  const { source, reference, canvas, apply, dispose } = nativePair();
  const beforeHeight = source.getBoundingRect().height;
  const event = gesture(source);
  event.e = new MouseEvent('mousemove');
  try {
    const feedback = apply(event);
    expect(canvas.uniformScaling).toBe(true);
    expect(source.getBoundingRect().width).toBeCloseTo(reference.getBoundingRect().width, 8);
    expect(source.getBoundingRect().height).toBe(beforeHeight);
    expect(feedback?.relations).toHaveLength(1);
  } finally {
    dispose();
  }
});
