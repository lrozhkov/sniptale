import { expect, it } from 'vitest';
import {
  getDrawingObjectBounds,
  transformDrawingObjectPoint,
  transformDrawingObjectVector,
  type DrawingObject,
  type DrawingPoint,
  type DrawingResizeHandle,
} from '../../features/drawing/public';
import { resizeDrawingObject, type PointerDraft } from './interaction';
import { resolveDrawingResizeAlignment } from './move-alignment';
import { createDefaultSimplifySettings } from '../../features/simplify/settings';

type Shape = Extract<
  DrawingObject,
  { kind: 'rectangle' | 'ellipse' | 'triangle' | 'parallelogram' }
>;
const shape = (kind: Shape['kind'] = 'rectangle'): Shape => ({
  id: 'resizing',
  kind,
  bounds: { x: 100, y: 100, width: 100, height: 80 },
  color: '#f00',
  width: 2,
});
function handlePoint(object: DrawingObject, handle: string): DrawingPoint {
  const b = getDrawingObjectBounds(object);
  return transformDrawingObjectPoint(object, {
    x: handle.includes('w') ? b.x : handle.includes('e') ? b.x + b.width : b.x + b.width / 2,
    y: handle.includes('n') ? b.y : handle.includes('s') ? b.y + b.height : b.y + b.height / 2,
  });
}
function gesture(
  original: DrawingObject,
  handle: DrawingResizeHandle,
  point: DrawingPoint,
  modifiers = { ctrlKey: false, shiftKey: false }
) {
  const start = handlePoint(original, handle);
  const draft: Extract<PointerDraft, { kind: 'resize' }> = {
    kind: 'resize',
    original,
    object: original,
    handle,
    start,
  };
  draft.object = resizeDrawingObject(draft, point, modifiers);
  return { draft, point, modifiers, objects: [original] };
}

for (const kind of ['rectangle', 'ellipse', 'triangle', 'parallelogram'] as const)
  for (const handle of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const)
    it(`snaps only the active ${kind} ${handle} handle and retains its fixed edges`, () => {
      const original = shape(kind),
        start = handlePoint(original, handle);
      const x = handle.includes('w') ? 50 : 300,
        y = handle.includes('n') ? 50 : 260;
      const horizontal = handle.includes('w') || handle.includes('e');
      const vertical = handle.includes('n') || handle.includes('s');
      const point = {
        x: horizontal ? x + (handle.includes('w') ? 4 : -4) : start.x,
        y: vertical ? y + (handle.includes('n') ? 4 : -4) : start.y,
      };
      const result = resolveDrawingResizeAlignment({
        ...gesture(original, handle, point),
        domBounds: [
          { x, y: 100, width: 40, height: 100 },
          { x: 100, y, width: 100, height: 40 },
        ],
      });
      const b = getDrawingObjectBounds(result.object);
      expect(b.x).toBe(handle.includes('w') ? x : 100);
      expect(b.y).toBe(handle.includes('n') ? y : 100);
      expect(b.x + b.width).toBe(handle.includes('e') ? x : 200);
      expect(b.y + b.height).toBe(handle.includes('s') ? y : 180);
      expect(result.guides).toHaveLength(Number(horizontal) + Number(vertical));
    });

it('releases resize alignment beyond six CSS pixels and excludes the resizing object', () => {
  const args = gesture(shape(), 'e', { x: 293, y: 140 });
  const result = resolveDrawingResizeAlignment({
    ...args,
    domBounds: [{ x: 300, y: 100, width: 80, height: 80 }],
  });
  expect(result.object).toBe(args.draft.object);
  expect(result.guides).toEqual([]);
  expect(resolveDrawingResizeAlignment({ ...args, objects: [args.draft.object] }).guides).toEqual(
    []
  );
});

it('preserves Shift aspect ratio and reports only the target actually reached', () => {
  const result = resolveDrawingResizeAlignment({
    ...gesture(shape(), 'se', { x: 296, y: 255 }, { shiftKey: true, ctrlKey: false }),
    domBounds: [{ x: 300, y: 255, width: 50, height: 50 }],
  });
  expect(getDrawingObjectBounds(result.object)).toEqual({
    x: 100,
    y: 100,
    width: 193.75,
    height: 155,
  });
  expect(result.guides.map((guide) => guide.axis)).toEqual(['y']);
});

it('preserves a center resize and the fixed center', () => {
  const result = resolveDrawingResizeAlignment({
    ...gesture(shape(), 'se', { x: 296, y: 256 }, { shiftKey: false, ctrlKey: true }),
    domBounds: [{ x: 300, y: 260, width: 50, height: 50 }],
  });
  expect(getDrawingObjectBounds(result.object)).toEqual({ x: 0, y: 20, width: 300, height: 240 });
});

it.each([30, 90, 135])(
  'snaps rotated corners at %s degrees without moving the opposite anchor',
  (rotation) => {
    const original = { ...shape('parallelogram'), rotation, skewX: 12 };
    const start = handlePoint(original, 'se'),
      delta = transformDrawingObjectVector(original, { x: 50, y: 40 });
    const args = gesture(original, 'se', { x: start.x + delta.x, y: start.y + delta.y });
    const rawHandle = handlePoint(args.draft.object, 'se');
    const result = resolveDrawingResizeAlignment({
      ...args,
      domBounds: [{ x: rawHandle.x + 4, y: rawHandle.y + 3, width: 50, height: 50 }],
    });
    expect(result.object).toMatchObject({ rotation, skewX: 12 });
    const fixed = handlePoint(result.object, 'nw'),
      previous = handlePoint(original, 'nw');
    expect(fixed.x).toBeCloseTo(previous.x, 6);
    expect(fixed.y).toBeCloseTo(previous.y, 6);
    const actual = handlePoint(result.object, 'se');
    expect(actual.x).toBeCloseTo(rawHandle.x + 4, 6);
    expect(actual.y).toBeCloseTo(rawHandle.y + 3, 6);
  }
);

it('uses the dragged edge after crossing the opposite anchor', () => {
  const result = resolveDrawingResizeAlignment({
    ...gesture(shape(), 'e', { x: 54, y: 140 }),
    domBounds: [{ x: 50, y: 100, width: 40, height: 80 }],
  });
  expect(getDrawingObjectBounds(result.object)).toEqual({ x: 50, y: 100, width: 50, height: 80 });
});

it('does not replace an explicit Ctrl shear with page alignment', () => {
  const args = gesture(shape(), 'n', { x: 155, y: 54 }, { ctrlKey: true, shiftKey: false });
  const result = resolveDrawingResizeAlignment({
    ...args,
    domBounds: [{ x: 50, y: 50, width: 200, height: 200 }],
  });
  expect(result.object).toBe(args.draft.object);
  expect(result.guides).toEqual([]);
});

it('does not advertise a stationary axis when a side handle coincides with another edge', () => {
  const result = resolveDrawingResizeAlignment({
    ...gesture(shape(), 'e', { x: 296, y: 140 }),
    domBounds: [{ x: 300, y: 140, width: 50, height: 50 }],
  });
  expect(getDrawingObjectBounds(result.object)).toEqual({ x: 100, y: 100, width: 200, height: 80 });
  expect(result.guides.map((guide) => guide.axis)).toEqual(['x']);
});

it.each([40, 140])('aligns the width to a drawn rectangle below with a %s pixel gap', (gap) => {
  const original = shape();
  const peer = { ...shape(), id: 'peer', bounds: { x: 100, y: 180 + gap, width: 200, height: 80 } };
  const result = resolveDrawingResizeAlignment({
    ...gesture(original, 'e', { x: 296, y: 140 }),
    objects: [original, peer],
  });
  expect(getDrawingObjectBounds(result.object)).toEqual({ x: 100, y: 100, width: 200, height: 80 });
  expect(result.guides.map((guide) => [guide.axis, guide.coordinate])).toEqual([['x', 300]]);
  expect(peer.bounds).toEqual({ x: 100, y: 180 + gap, width: 200, height: 80 });
});

it('aligns the height to a drawn rectangle in a separate column', () => {
  const original = shape();
  const peer = { ...shape(), id: 'peer', bounds: { x: 400, y: 100, width: 100, height: 160 } };
  const result = resolveDrawingResizeAlignment({
    ...gesture(original, 's', { x: 150, y: 256 }),
    objects: [original, peer],
  });
  expect(getDrawingObjectBounds(result.object)).toEqual({
    x: 100,
    y: 100,
    width: 100,
    height: 160,
  });
  expect(result.guides.map((guide) => [guide.axis, guide.coordinate])).toEqual([['y', 260]]);
});

it.each(['blur', 'pencil', 'marker', 'text', 'simplify'] as const)(
  'snaps supported %s resize through the canonical resizer',
  (kind) => {
    const original: DrawingObject =
      kind === 'blur'
        ? { id: kind, kind, bounds: shape().bounds }
        : kind === 'simplify'
          ? { id: kind, kind, bounds: shape().bounds, settings: createDefaultSimplifySettings() }
          : kind === 'text'
            ? {
                id: kind,
                kind,
                bounds: shape().bounds,
                text: 'Title',
                fontSize: 16,
                color: '#000',
                backgroundColor: null,
              }
            : {
                id: kind,
                kind,
                samples: [
                  { x: 100, y: 100, t: 0 },
                  { x: 200, y: 180, t: 1 },
                ],
                color: '#000',
                width: 2,
                opacity: 0.5,
              };
    const result = resolveDrawingResizeAlignment({
      ...gesture(original, 'e', { x: 296, y: 140 }),
      domBounds: [{ x: 300, y: 100, width: 40, height: 80 }],
    });
    const bounds = getDrawingObjectBounds(result.object);
    const originalBounds = getDrawingObjectBounds(original);
    const tolerance = kind === 'pencil' || kind === 'marker' ? 0.5 : 1e-6;
    if (kind !== 'pencil' && kind !== 'marker')
      expect(Math.abs(bounds.x - originalBounds.x)).toBeLessThanOrEqual(tolerance);
    else {
      expect(result.object).toMatchObject({ kind, width: 2 });
      if (result.object.kind === 'pencil' || result.object.kind === 'marker')
        expect(result.object.samples.map((sample) => sample.t)).toEqual([0, 1]);
    }
    expect(Math.abs(bounds.x + bounds.width - 300)).toBeLessThanOrEqual(tolerance);
    expect(result.guides.map((guide) => guide.axis)).toEqual(['x']);
  }
);
it.each(['start', 'end'] as const)(
  'snaps arrow %s endpoint without changing its other endpoint or bends',
  (handle) => {
    const original: Extract<DrawingObject, { kind: 'arrow' }> = {
      id: 'arrow',
      kind: 'arrow',
      start: { x: 100, y: 100 },
      end: { x: 200, y: 180 },
      bendPoints: [{ x: 150, y: 70 }],
      color: '#000',
      width: 2,
      dynamicWidth: false,
    };
    const start = original[handle];
    const point = { x: 296, y: 256 };
    const draft: Extract<PointerDraft, { kind: 'resize' }> = {
      kind: 'resize',
      original,
      object: original,
      handle,
      start,
    };
    draft.object = resizeDrawingObject(draft, point);
    const result = resolveDrawingResizeAlignment({
      draft,
      point,
      modifiers: { ctrlKey: false, shiftKey: false },
      objects: [original],
      domBounds: [{ x: 300, y: 260, width: 40, height: 40 }],
    });
    expect(result.object).toMatchObject({
      [handle]: { x: 300, y: 260 },
      [handle === 'start' ? 'end' : 'start']: original[handle === 'start' ? 'end' : 'start'],
      bendPoints: original.bendPoints,
    });
    expect(result.guides).toHaveLength(2);
  }
);

it('retains Shift arrow endpoint direction while accepting only reached guides', () => {
  const original: Extract<DrawingObject, { kind: 'arrow' }> = {
    id: 'arrow',
    kind: 'arrow',
    start: { x: 100, y: 100 },
    end: { x: 200, y: 200 },
    color: '#000',
    width: 2,
    dynamicWidth: false,
  };
  const point = { x: 296, y: 296 },
    modifiers = { ctrlKey: false, shiftKey: true };
  const draft: Extract<PointerDraft, { kind: 'resize' }> = {
    kind: 'resize',
    original,
    object: original,
    handle: 'end',
    start: original.end,
  };
  draft.object = resizeDrawingObject(draft, point, modifiers);
  const result = resolveDrawingResizeAlignment({
    draft,
    point,
    modifiers,
    objects: [original],
    domBounds: [{ x: 300, y: 360, width: 40, height: 40 }],
  });
  expect(result.object.kind).toBe('arrow');
  if (result.object.kind !== 'arrow') throw new Error('Expected an arrow');
  expect(result.object.start).toEqual(original.start);
  expect(result.object.end.x).toBeCloseTo(300, 6);
  expect(result.object.end.y).toBeCloseTo(300, 6);
  expect(result.guides.map((guide) => guide.axis)).toEqual(['x']);
});
