// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { captureDrawingFrame, registerDrawingSnapshotSource } from './frame';
import { renderDrawingObject } from './render';

vi.mock('./render', () => ({ renderDrawingObject: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
import type { DrawingObject } from '../../features/drawing/public';
import type { PointerDraft } from './interaction';
import { resolveDrawingFrameRenderables } from './frame-renderables';

const original: DrawingObject = {
  bounds: { x: 10, y: 20, width: 40, height: 30 },
  color: '#ef4444',
  id: 'edited',
  kind: 'rectangle',
  width: 4,
};
const untouched: DrawingObject = {
  bounds: { x: 100, y: 100, width: 20, height: 20 },
  id: 'untouched',
  kind: 'blur',
};

it.each(['move', 'resize'] as const)(
  'renders the live %s draft in place of its committed object',
  (kind) => {
    const live = { ...original, bounds: { ...original.bounds, x: 60, width: 80 } };
    const draft: PointerDraft =
      kind === 'resize'
        ? {
            handle: 'e',
            kind: 'resize',
            object: live,
            original,
            start: { x: 10, y: 20 },
          }
        : {
            kind: 'move',
            object: live,
            original,
            start: { x: 10, y: 20 },
          };

    expect(resolveDrawingFrameRenderables([original, untouched], draft)).toEqual([
      { object: live },
      { object: untouched },
    ]);
  }
);

it('resolves a multi-selection draft with work proportional to its objects', () => {
  const committed: DrawingObject[] = Array.from({ length: 200 }, (_, index) => ({
    bounds: { x: index, y: index, width: 20, height: 20 },
    id: `object-${index}`,
    kind: 'blur',
  }));
  let draftIdReads = 0;
  const moved: DrawingObject[] = committed.slice(100).map((object) => ({
    ...object,
    bounds: { x: 500, y: 500, width: 20, height: 20 },
    get id() {
      draftIdReads += 1;
      return object.id;
    },
  }));
  const draft: PointerDraft = {
    kind: 'move-selection',
    start: { x: 0, y: 0 },
    originals: committed.slice(100),
    objects: moved,
  };

  const renderables = resolveDrawingFrameRenderables(committed, draft);

  expect(renderables.map(({ object }) => object)).toEqual([...committed.slice(0, 100), ...moved]);
  expect(draftIdReads).toBeLessThanOrEqual(moved.length * 2);
});

it('keeps committed objects and appends the live create object', () => {
  const draft: PointerDraft = {
    kind: 'create',
    arrowFromTip: false,
    object: original,
    start: { x: 10, y: 20 },
  };
  expect(resolveDrawingFrameRenderables([untouched], draft)).toEqual([
    { object: untouched },
    { object: original },
  ]);
});

it.each(['move', 'resize'] as const)('projects a live blur %s draft into the DOM layer', (kind) => {
  const committed: DrawingObject = {
    bounds: { x: 10, y: 20, width: 40, height: 30 },
    id: 'live-blur',
    kind: 'blur',
  };
  const live = { ...committed, bounds: { x: 60, y: 70, width: 80, height: 50 } };
  const draft: PointerDraft =
    kind === 'resize'
      ? {
          handle: 'se',
          kind: 'resize',
          object: live,
          original: committed,
          start: { x: 10, y: 20 },
        }
      : {
          kind: 'move',
          object: live,
          original: committed,
          start: { x: 10, y: 20 },
        };

  expect(resolveDrawingFrameRenderables([committed], draft)).toEqual([{ object: live }]);
});

it('projects committed ink beyond the viewport while excluding DOM text and blur', () => {
  const context = { setTransform: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  const canvas = document.createElement('canvas');
  const distant = { ...original, id: 'distant', bounds: { ...original.bounds, y: 2000 } };
  const unregister = registerDrawingSnapshotSource(canvas, () => ({
    objects: [original, distant, untouched],
    root: { kind: 'viewport', element: null },
  }));

  const snapshot = captureDrawingFrame(canvas)!;

  expect(snapshot.height).toBeGreaterThan(2000);
  expect(snapshot.style.top).toBe('16px');
  expect(renderDrawingObject).toHaveBeenCalledWith(
    context,
    distant,
    { x: 6, y: 16 },
    { opacity: 1 }
  );
  expect(canvas.width).toBe(300);
  unregister();
  expect(captureDrawingFrame(canvas)).toBeNull();
});

it('bounds raster allocation for a large scene while retaining its CSS extent', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: vi.fn(),
  } as never);
  const canvas = document.createElement('canvas');
  const huge = { ...original, bounds: { x: 0, y: 0, width: 100000, height: 100000 } };
  registerDrawingSnapshotSource(canvas, () => ({
    objects: [huge],
    root: { kind: 'viewport', element: null },
  }));

  const snapshot = captureDrawingFrame(canvas)!;

  expect(snapshot.width * snapshot.height).toBeLessThanOrEqual(16_777_216);
  expect(snapshot.style.width).toBe('100008px');
});

it('fails explicitly when the snapshot renderer cannot allocate a context', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const canvas = document.createElement('canvas');
  registerDrawingSnapshotSource(canvas, () => ({
    objects: [original],
    root: { kind: 'viewport', element: null },
  }));
  expect(() => captureDrawingFrame(canvas)).toThrow('Drawing snapshot canvas is unavailable');
});

it('keeps element-scroll clipping and a replacement binding after stale cleanup', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: vi.fn(),
  } as never);
  const canvas = document.createElement('canvas');
  const root = document.createElement('div');
  root.getBoundingClientRect = () => new DOMRect(100, 200, 80, 60);
  const staleCleanup = registerDrawingSnapshotSource(canvas, () => ({
    objects: [],
    root: { kind: 'viewport', element: null },
  }));
  registerDrawingSnapshotSource(canvas, () => ({
    objects: [original],
    root: { kind: 'element', element: root },
  }));
  staleCleanup();

  const snapshot = captureDrawingFrame(canvas)!;

  expect(snapshot.style.left).toBe('106px');
  expect(snapshot.style.top).toBe('216px');
  expect(snapshot.style.clipPath).toBe('inset(0px 0px 0px 0px)');
});

it('reads the current scene and never falls back to stale pixels after clearing it', () => {
  const canvas = document.createElement('canvas');
  registerDrawingSnapshotSource(canvas, () => ({
    objects: [],
    root: { kind: 'viewport', element: null },
  }));

  const snapshot = captureDrawingFrame(canvas)!;

  expect(snapshot).not.toBe(canvas);
  expect(snapshot.width).toBe(1);
  expect(snapshot.height).toBe(1);
  expect(snapshot.style.display).toBe('none');
});
