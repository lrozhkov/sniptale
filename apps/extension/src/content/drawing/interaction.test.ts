import { afterEach, expect, it, vi } from 'vitest';
import {
  resolveDrawingLinearPoint,
  updateCreatedDrawingObject,
} from '../../features/drawing/public';
import {
  createDefaultDrawingToolDefaults,
  createDrawingSession,
  type DrawingCreatableShapeKind,
} from '../../features/drawing/public';
import {
  beginDrawingPointer,
  commitDrawingPointerDraft,
  getDrawingRotationHandlePoint,
  resolveDrawingRotationHandle,
  resolveDrawingResizeHandle,
  resizeDrawingObject,
  rotateDrawingObject,
} from './interaction';

afterEach(() => vi.restoreAllMocks());

it.each<DrawingCreatableShapeKind>(['rectangle', 'ellipse', 'triangle'])(
  'creates and commits the selected %s shape through the unified shape tool',
  (kind) => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000000'
    );
    const session = createDrawingSession({ onDocumentCommit: () => true });
    const defaults = createDefaultDrawingToolDefaults(['#ef4444']);
    session.setDefaults({
      ...defaults,
      shape: { color: '#ef4444', fillColor: '#12345680', kind, width: 4 },
    });
    session.setActiveTool('shape');
    const started = beginDrawingPointer({
      point: { x: 10, y: 20 },
      snapshot: session.getSnapshot(),
      timestamp: 0,
    });
    if (!started.draft || started.draft.kind !== 'create') throw new Error('Expected shape draft');
    expect(started.draft.object.kind).toBe(kind);
    const object = updateCreatedDrawingObject({
      object: started.draft.object,
      modifiers: { ctrlKey: false, shiftKey: false },
      point: { x: 70, y: 60 },
      start: started.draft.start,
      timestamp: 10,
    });
    commitDrawingPointerDraft(session, { ...started.draft, object });
    expect(session.getSnapshot().document.objects[0]).toMatchObject({
      bounds: { x: 10, y: 20, width: 60, height: 40 },
      fillColor: '#12345680',
      kind,
    });
    expect(session.getSnapshot().selectedObjectId).toBe(
      'drawing-00000000-0000-4000-8000-000000000000'
    );
  }
);

it.each(['pencil', 'marker'] as const)('commits a new %s stroke without selecting it', (tool) => {
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.setActiveTool(tool);
  const started = beginDrawingPointer({
    point: { x: 10, y: 20 },
    snapshot: session.getSnapshot(),
    timestamp: 0,
  });
  if (!started.draft || started.draft.kind !== 'create') throw new Error('Expected stroke draft');
  const object = updateCreatedDrawingObject({
    object: started.draft.object,
    modifiers: { ctrlKey: false, shiftKey: false },
    point: { x: 70, y: 60 },
    start: started.draft.start,
    timestamp: 10,
  });

  commitDrawingPointerDraft(session, { ...started.draft, object });

  expect(session.getSnapshot().document.objects[0]?.kind).toBe(tool);
  expect(session.getSnapshot().selectedObjectId).toBeNull();
});

it('uses canonical Shift add, Ctrl toggle, and empty-space marquee selection starts', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    bounds: { x: 0, y: 0, width: 30, height: 30 },
    id: 'one',
    kind: 'blur',
  });
  session.commitObject({
    bounds: { x: 50, y: 0, width: 30, height: 30 },
    id: 'two',
    kind: 'blur',
  });
  session.setActiveTool('select');
  session.select('one');

  const shift = beginDrawingPointer({
    modifiers: { ctrlKey: false, shiftKey: true },
    point: { x: 60, y: 10 },
    snapshot: session.getSnapshot(),
    timestamp: 0,
  });
  expect(shift).toMatchObject({ draft: null, selection: ['one', 'two'] });

  session.setSelection(shift.selection ?? []);
  const ctrl = beginDrawingPointer({
    modifiers: { ctrlKey: true, shiftKey: false },
    point: { x: 10, y: 10 },
    snapshot: session.getSnapshot(),
    timestamp: 0,
  });
  expect(ctrl).toMatchObject({ draft: null, selection: ['two'] });

  const marquee = beginDrawingPointer({
    modifiers: { ctrlKey: false, shiftKey: false },
    point: { x: 100, y: 100 },
    snapshot: session.getSnapshot(),
    timestamp: 0,
  });
  expect(marquee).toMatchObject({
    draft: { kind: 'marquee', mode: 'replace' },
    selection: [],
  });
});

it('starts a group move from an already selected object and commits every object once', () => {
  const onDocumentCommit = vi.fn(() => true);
  const session = createDrawingSession({ onDocumentCommit });
  session.commitObject({
    bounds: { x: 0, y: 0, width: 30, height: 30 },
    id: 'one',
    kind: 'blur',
  });
  session.commitObject({
    bounds: { x: 50, y: 0, width: 30, height: 30 },
    id: 'two',
    kind: 'blur',
  });
  session.setActiveTool('select');
  session.setSelection(['one', 'two']);
  const started = beginDrawingPointer({
    point: { x: 10, y: 10 },
    snapshot: session.getSnapshot(),
    timestamp: 0,
  });
  if (started.draft?.kind !== 'move-selection') throw new Error('Expected group move');
  onDocumentCommit.mockClear();
  commitDrawingPointerDraft(session, {
    ...started.draft,
    objects: started.draft.originals.map((object) => {
      if (!('bounds' in object)) return object;
      return { ...object, bounds: { ...object.bounds, x: object.bounds.x + 20 } };
    }),
  });

  expect(onDocumentCommit).toHaveBeenCalledTimes(1);
  expect(
    session
      .getSnapshot()
      .document.objects.map((object) => ('bounds' in object ? object.bounds.x : null))
  ).toEqual([20, 70]);
});

it('uses soft angle magnetism for linear tools and lets Ctrl bypass it', () => {
  const start = { x: 10, y: 20 };
  const point = { x: 110, y: 25 };

  expect(
    resolveDrawingLinearPoint({
      modifiers: { ctrlKey: false, shiftKey: false },
      point,
      start,
    })
  ).toEqual({ x: 110.12492197250393, y: 20 });
  expect(
    resolveDrawingLinearPoint({
      modifiers: { ctrlKey: true, shiftKey: false },
      point,
      start,
    })
  ).toEqual(point);
});

it('uses strict 15 degree steps for linear tools while Shift is held', () => {
  const start = { x: 10, y: 20 };
  const point = resolveDrawingLinearPoint({
    modifiers: { ctrlKey: true, shiftKey: true },
    point: { x: 110, y: 60 },
    start,
  });
  const angle = Math.round((Math.atan2(point.y - start.y, point.x - start.x) * 180) / Math.PI);

  expect(angle).toBe(15);
  expect(Math.hypot(point.x - start.x, point.y - start.y)).toBeCloseTo(Math.hypot(100, 40));
});

it.each([
  [
    { ctrlKey: true, shiftKey: false },
    { x: 110, y: 60 },
  ],
  [
    { ctrlKey: false, shiftKey: true },
    { x: 114.03339532068415, y: 47.875664262045056 },
  ],
] as const)(
  'turns a modified pencil or marker gesture into one straight segment',
  (modifiers, end) => {
    (['pencil', 'marker'] as const).forEach((tool) => {
      const session = createDrawingSession({ onDocumentCommit: () => true });
      session.setActiveTool(tool);
      const started = beginDrawingPointer({
        point: { x: 10, y: 20 },
        snapshot: session.getSnapshot(),
        timestamp: 0,
      });
      if (!started.draft || started.draft.kind !== 'create') {
        throw new Error('Expected stroke draft');
      }

      const object = updateCreatedDrawingObject({
        object: started.draft.object,
        modifiers,
        point: { x: 110, y: 60 },
        start: started.draft.start,
        timestamp: 10,
      });

      expect(object).toMatchObject({
        kind: tool,
        samples: [
          { x: 10, y: 20, t: 0 },
          { ...end, t: 10 },
        ],
      });
    });
  }
);

it('rotates selected objects from the external corner zone with canonical modifiers', () => {
  const rectangle = {
    bounds: { x: 10, y: 20, width: 100, height: 40 },
    color: '#ef4444',
    id: 'rectangle',
    kind: 'rectangle' as const,
    width: 4,
  };
  const center = { x: 60, y: 40 };
  const start = getDrawingRotationHandlePoint(rectangle, 'rotate-ne');
  if (!start) throw new Error('Expected rotation handle');
  const rotatedPoint = (degrees: number) => {
    const radians = (degrees * Math.PI) / 180;
    const x = start.x - center.x;
    const y = start.y - center.y;
    return {
      x: center.x + x * Math.cos(radians) - y * Math.sin(radians),
      y: center.y + x * Math.sin(radians) + y * Math.cos(radians),
    };
  };
  const draft = {
    handle: 'rotate-ne' as const,
    kind: 'rotate' as const,
    object: rectangle,
    original: rectangle,
    start,
  };

  expect(resolveDrawingRotationHandle(rectangle, start)).toBe('rotate-ne');
  expect(
    rotateDrawingObject(draft, rotatedPoint(23), { ctrlKey: true, shiftKey: false })
  ).toMatchObject({ rotation: 23 });
  expect(
    rotateDrawingObject(draft, rotatedPoint(23), { ctrlKey: false, shiftKey: true })
  ).toMatchObject({ rotation: 30 });
  expect(
    rotateDrawingObject(draft, rotatedPoint(43), { ctrlKey: false, shiftKey: false })
  ).toMatchObject({ rotation: 45 });
  expect(
    rotateDrawingObject(draft, rotatedPoint(23), { ctrlKey: true, shiftKey: true })
  ).toMatchObject({ rotation: 30 });
});

it('offers external rotation zones for every object family except arrows', () => {
  const bounds = { x: 10, y: 20, width: 100, height: 40 };
  const objects = [
    {
      id: 'pencil',
      kind: 'pencil' as const,
      samples: [
        { x: 10, y: 20, t: 0 },
        { x: 110, y: 60, t: 1 },
      ],
      color: '#111827',
      width: 4,
    },
    {
      id: 'marker',
      kind: 'marker' as const,
      samples: [
        { x: 10, y: 20, t: 0 },
        { x: 110, y: 60, t: 1 },
      ],
      color: '#facc15',
      opacity: 0.3,
      width: 16,
    },
    { id: 'rectangle', kind: 'rectangle' as const, bounds, color: '#111827', width: 4 },
    { id: 'ellipse', kind: 'ellipse' as const, bounds, color: '#111827', width: 4 },
    { id: 'triangle', kind: 'triangle' as const, bounds, color: '#111827', width: 4 },
    { id: 'parallelogram', kind: 'parallelogram' as const, bounds, color: '#111827', width: 4 },
    { id: 'blur', kind: 'blur' as const, bounds },
    {
      id: 'text',
      kind: 'text' as const,
      bounds,
      backgroundColor: null,
      color: '#111827',
      fontSize: 20,
      text: 'Text',
    },
  ];
  objects.forEach((object) => {
    const point = getDrawingRotationHandlePoint(object, 'rotate-ne');
    expect(point).not.toBeNull();
    expect(point && resolveDrawingRotationHandle(object, point)).toBe('rotate-ne');
  });
  expect(
    resolveDrawingRotationHandle(
      {
        id: 'arrow',
        kind: 'arrow',
        start: { x: 10, y: 20 },
        end: { x: 110, y: 60 },
        color: '#111827',
        dynamicWidth: true,
        width: 12,
      },
      { x: 120, y: 10 }
    )
  ).toBeNull();
});

it('resizes a text box by width only without scaling its font', () => {
  const text = {
    backgroundColor: null,
    bounds: { x: 20, y: 30, width: 200, height: 40 },
    color: '#111827',
    fontSize: 20,
    id: 'text',
    kind: 'text' as const,
    text: 'A text box with enough words to wrap across several lines',
  };
  expect(resolveDrawingResizeHandle(text, { x: 220, y: 50 })).toBe('e');
  expect(resolveDrawingResizeHandle(text, { x: 220, y: 30 })).toBeNull();
  const draft = {
    handle: 'e' as const,
    kind: 'resize' as const,
    object: text,
    original: text,
    start: { x: 220, y: 50 },
  };
  const narrowed = resizeDrawingObject(draft, { x: -1_000, y: 500 });
  const widened = resizeDrawingObject(draft, { x: 2_000, y: -500 });

  expect(narrowed).toMatchObject({ fontSize: 20, bounds: { x: 20, y: 30 } });
  expect(widened).toMatchObject({ fontSize: 20, bounds: { x: 20, y: 30 } });
  if (narrowed.kind !== 'text' || widened.kind !== 'text') throw new Error('Expected text');
  expect(narrowed.bounds.width).toBeGreaterThanOrEqual(80);
  expect(widened.bounds.width).toBeGreaterThan(640);
  expect(narrowed.bounds.height).toBeGreaterThan(widened.bounds.height);
});

it.each([
  ['Shift', { ctrlKey: false, shiftKey: true }, { x: 10, y: 20, width: 150, height: 75 }],
  ['Ctrl', { ctrlKey: true, shiftKey: false }, { x: -40, y: 0, width: 200, height: 90 }],
  ['Ctrl+Shift', { ctrlKey: true, shiftKey: true }, { x: -40, y: -5, width: 200, height: 100 }],
] as const)('%s applies canonical constrained box resizing', (_label, modifiers, bounds) => {
  const rectangle = {
    bounds: { x: 10, y: 20, width: 100, height: 50 },
    color: '#ef4444',
    id: 'rectangle',
    kind: 'rectangle' as const,
    width: 4,
  };
  const resized = resizeDrawingObject(
    {
      handle: 'se',
      kind: 'resize',
      object: rectangle,
      original: rectangle,
      start: { x: 110, y: 70 },
    },
    { x: 160, y: 90 },
    modifiers
  );

  expect(resized).toMatchObject({ bounds });
});

it('keeps the opposite dimension centered when Shift-resizing a box from a side handle', () => {
  const rectangle = {
    bounds: { x: 10, y: 20, width: 100, height: 50 },
    color: '#ef4444',
    id: 'rectangle',
    kind: 'rectangle' as const,
    width: 4,
  };
  const resized = resizeDrawingObject(
    {
      handle: 'e',
      kind: 'resize',
      object: rectangle,
      original: rectangle,
      start: { x: 110, y: 45 },
    },
    { x: 160, y: 45 },
    { ctrlKey: false, shiftKey: true }
  );

  expect(resized).toMatchObject({ bounds: { x: 10, y: 7.5, width: 150, height: 75 } });
});

it('preserves the pointer-to-handle offset instead of jumping at resize start', () => {
  const rectangle = {
    bounds: { x: 10, y: 20, width: 100, height: 50 },
    color: '#ef4444',
    id: 'rectangle',
    kind: 'rectangle' as const,
    width: 4,
  };
  const resized = resizeDrawingObject(
    {
      handle: 'se',
      kind: 'resize',
      object: rectangle,
      original: rectangle,
      start: { x: 108, y: 69 },
    },
    { x: 118, y: 79 }
  );

  expect(resized).toMatchObject({ bounds: { x: 10, y: 20, width: 110, height: 60 } });
});

it('keeps the opposite handle fixed while resizing a rotated object', () => {
  const rectangle = {
    bounds: { x: 10, y: 20, width: 100, height: 50 },
    color: '#ef4444',
    id: 'rectangle',
    kind: 'rectangle' as const,
    rotation: 90,
    width: 4,
  };
  expect(resolveDrawingResizeHandle(rectangle, { x: 60, y: 95 })).toBe('e');
  const resized = resizeDrawingObject(
    {
      handle: 'e',
      kind: 'resize',
      object: rectangle,
      original: rectangle,
      start: { x: 60, y: 95 },
    },
    { x: 60, y: 145 }
  );

  expect(resized).toMatchObject({
    bounds: { x: -15, y: 45, width: 150, height: 50 },
    rotation: 90,
  });
});

it('shears shapes from a horizontal side handle with Ctrl and snaps with Ctrl+Shift', () => {
  const rectangle = {
    bounds: { x: 10, y: 20, width: 100, height: 50 },
    color: '#ef4444',
    id: 'rectangle',
    kind: 'rectangle' as const,
    width: 4,
  };
  const draft = {
    handle: 'n' as const,
    kind: 'resize' as const,
    object: rectangle,
    original: rectangle,
    start: { x: 60, y: 20 },
  };

  expect(
    resizeDrawingObject(draft, { x: 85, y: 20 }, { ctrlKey: true, shiftKey: false })
  ).toMatchObject({ bounds: { x: 10, y: 20, width: 125, height: 50 } });
  expect(
    resizeDrawingObject(draft, { x: 85, y: 20 }, { ctrlKey: true, shiftKey: false })
  ).toHaveProperty('skewX', Math.atan(0.5) * (180 / Math.PI));
  expect(
    resizeDrawingObject(draft, { x: 70, y: 20 }, { ctrlKey: true, shiftKey: true })
  ).toMatchObject({ skewX: 15 });
  expect(
    resizeDrawingObject(draft, { x: 85, y: 20 }, { ctrlKey: false, shiftKey: false })
  ).not.toHaveProperty('skewX');
});
