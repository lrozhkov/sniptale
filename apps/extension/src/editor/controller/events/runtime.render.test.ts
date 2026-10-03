// @vitest-environment jsdom

import { Canvas, FabricObject, Point, Rect } from 'fabric';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createFabricCanvasFixture,
  createTypedTestFixture,
} from '../../testing/fabric-canvas.test-support';
import {
  renderBackdropCanvas,
  type MutableBlurCanvas,
} from '../../objects/annotation/blur/backdrop/canvas';

const mocks = vi.hoisted(() => ({
  readDrawing: vi.fn(),
  renderPreview: vi.fn(),
}));

vi.mock('../../drawing/object/metadata', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../drawing/object/metadata')>()),
  readEditorDrawingObject: mocks.readDrawing,
}));
vi.mock('../../drawing/preview', () => ({
  renderEditorFreehandPreview: mocks.renderPreview,
}));

import {
  cancelEditorFreehandPreview,
  createAfterRenderHandler,
  requestEditorFreehandPreview,
} from './runtime.render';
import { createBeforeRenderHandler } from './runtime.canvas';
import type { DrawSession } from '../core/types';

beforeEach(() => vi.clearAllMocks());

it('draws an invisible freehand draft on the top canvas with the viewport transform', () => {
  const object = new FabricObject({ visible: false });
  const drawing = { id: 'pencil-1', kind: 'pencil' };
  const mainContext = createTypedTestFixture<CanvasRenderingContext2D>({});
  const context = createTypedTestFixture<CanvasRenderingContext2D>({
    restore: vi.fn(),
    save: vi.fn(),
    transform: vi.fn(),
  });
  mocks.readDrawing.mockReturnValue(drawing);
  const handler = createAfterRenderHandler({
    getCanvas: () =>
      createFabricCanvasFixture({
        contextTop: context,
        getContext: () => mainContext,
        getSelectionContext: () => context,
        viewportTransform: [2, 0, 0, 2, 10, 20],
      }),
    getDrawSession: () => ({
      object,
      objectId: 'pencil-1',
      pointerId: 7,
      start: new Point(0, 0),
      tool: 'pencil',
    }),
  });

  handler({ ctx: mainContext });

  expect(context.transform).toHaveBeenCalledWith(2, 0, 0, 2, 10, 20);
  expect(mocks.renderPreview).toHaveBeenCalledWith(context, drawing);
  expect(context.restore).toHaveBeenCalledOnce();
});

it('draws live overlays only for the main render context during a nested blur backdrop render', () => {
  const object = new FabricObject({ visible: false });
  const drawing = { id: 'pencil-right', kind: 'pencil' };
  const mainContext = createTypedTestFixture<CanvasRenderingContext2D>({});
  const backdropContext = createTypedTestFixture<CanvasRenderingContext2D>({});
  const topContext = createTypedTestFixture<CanvasRenderingContext2D>({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    transform: vi.fn(),
  });
  const canvas = createFabricCanvasFixture({
    calcViewportBoundaries: vi.fn(),
    contextTop: topContext,
    enableRetinaScaling: true,
    getContext: () => mainContext,
    getObjects: () => [],
    getSelectionContext: () => topContext,
    height: 100,
    renderCanvas: (ctx: CanvasRenderingContext2D) => handler({ ctx }),
    skipControlsDrawing: false,
    viewportTransform: [2, 0, 0, 2, 10, 20],
    width: 200,
  });
  mocks.readDrawing.mockReturnValue(drawing);
  const handler = createAfterRenderHandler({
    getCanvas: () => canvas,
    getDrawSession: () => ({
      object,
      objectId: 'pencil-right',
      pointerId: 7,
      start: new Point(130, 30),
      tool: 'pencil',
    }),
  });

  renderBackdropCanvas({
    backdropCanvas: { height: 30, width: 40 } as HTMLCanvasElement,
    bounds: { height: 20, left: 120, paddedHeight: 30, paddedWidth: 40, top: 10, width: 30 },
    canvas: canvas as MutableBlurCanvas,
    context: backdropContext,
    objectIndex: 0,
  });
  expect(mocks.renderPreview).not.toHaveBeenCalled();
  expect(topContext.fillRect).not.toHaveBeenCalled();
  expect(topContext.clearRect).not.toHaveBeenCalled();
  expect(topContext.transform).not.toHaveBeenCalled();

  handler({ ctx: mainContext });
  expect(mocks.renderPreview).toHaveBeenCalledExactlyOnceWith(topContext, drawing);
  expect(topContext.fillRect).not.toHaveBeenCalled();
  expect(topContext.transform).toHaveBeenCalledExactlyOnceWith(2, 0, 0, 2, 10, 20);
});

it('leaves the crop mask to the DOM plane while ignoring an invisible non-freehand draft', () => {
  const object = new FabricObject({ visible: false });
  const mainContext = createTypedTestFixture<CanvasRenderingContext2D>({});
  const context = createTypedTestFixture<CanvasRenderingContext2D>({
    fillRect: vi.fn(),
    fillStyle: '',
    restore: vi.fn(),
    save: vi.fn(),
    transform: vi.fn(),
  });
  mocks.readDrawing.mockReturnValue({ id: 'shape-1', kind: 'rectangle' });
  const handler = createAfterRenderHandler({
    getCanvas: () =>
      createFabricCanvasFixture({
        contextTop: context,
        getContext: () => mainContext,
        getSelectionContext: () => context,
        viewportTransform: [1, 0, 0, 1, 0, 0],
      }),
    getDrawSession: () => ({
      object,
      objectId: 'shape-1',
      pointerId: 7,
      start: new Point(0, 0),
      tool: 'shape',
    }),
  });

  handler({ ctx: mainContext });

  expect(mocks.renderPreview).not.toHaveBeenCalled();
  expect(context.fillRect).not.toHaveBeenCalled();
  expect(context.restore).toHaveBeenCalledOnce();
});

it.each([
  { object: undefined, title: 'a missing object' },
  { object: new FabricObject({ visible: true }), title: 'a visible object' },
])('skips preview work for $title', ({ object }) => {
  const mainContext = createTypedTestFixture<CanvasRenderingContext2D>({});
  const context = createTypedTestFixture<CanvasRenderingContext2D>({
    restore: vi.fn(),
    save: vi.fn(),
    transform: vi.fn(),
  });
  const handler = createAfterRenderHandler({
    getCanvas: () =>
      createFabricCanvasFixture({
        contextTop: context,
        getContext: () => mainContext,
        getSelectionContext: () => context,
        viewportTransform: [1, 0, 0, 1, 0, 0],
      }),
    getDrawSession: () =>
      object
        ? {
            object,
            objectId: 'drawing-1',
            pointerId: 7,
            start: new Point(0, 0),
            tool: 'pencil',
          }
        : null,
  });

  handler({ ctx: mainContext });

  expect(mocks.readDrawing).not.toHaveBeenCalled();
  expect(mocks.renderPreview).not.toHaveBeenCalled();
});

function createPreviewLifecycle() {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frame) => {
    frames.delete(frame);
  });
  const canvas = new Canvas(document.createElement('canvas'), { renderOnAddRemove: false });
  const object = new Rect({ visible: false });
  canvas.add(object);
  let session: DrawSession | null = {
    object,
    objectId: 'draft',
    pointerId: 1,
    tool: 'pencil',
    start: new Point(),
  };
  let currentCanvas: Canvas | null = canvas;
  const bindings = { getCanvas: () => currentCanvas, getDrawSession: () => session };
  canvas.on('before:render', createBeforeRenderHandler(bindings));
  canvas.on('after:render', createAfterRenderHandler(bindings));
  mocks.readDrawing.mockReturnValue({ kind: 'pencil', id: 'draft' });
  mocks.renderPreview.mockReturnValue(true);
  const flush = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(0));
  };
  return {
    canvas,
    object,
    bindings,
    frames,
    flush,
    end: () => {
      session = null;
    },
    replace: () => {
      session = session ? { ...session } : null;
    },
    detachCanvas: () => {
      currentCanvas = null;
    },
  };
}

afterEach(() => vi.restoreAllMocks());

it('coalesces top frames without rendering committed objects and clears each translucent preview', () => {
  const fixture = createPreviewLifecycle();
  const { canvas, bindings, flush } = fixture;
  const committed = new Rect();
  canvas.add(committed);
  const render = vi.spyOn(committed, 'render');
  const clear = vi.spyOn(canvas, 'clearContext');
  for (let i = 0; i < 8; i++) requestEditorFreehandPreview(bindings);
  expect(fixture.frames.size).toBe(1);
  flush();
  expect(render).not.toHaveBeenCalled();
  expect(mocks.renderPreview).toHaveBeenCalledOnce();
  expect(clear).toHaveBeenCalledExactlyOnceWith(canvas.contextTop);
  expect(canvas.contextTopDirty).toBe(true);
  requestEditorFreehandPreview(bindings);
  flush();
  expect(clear).toHaveBeenCalledTimes(2);
  expect(mocks.renderPreview).toHaveBeenCalledTimes(2);
  fixture.end();
  canvas.renderAll();
  expect(canvas.contextTopDirty).toBe(false);
  expect(mocks.renderPreview).toHaveBeenCalledTimes(2);
  expect(render).toHaveBeenCalledOnce();
  canvas.destroy();
});

it.each(['before', 'after'])(
  'refreshes a live preview with the scene %s a queued top frame',
  (order) => {
    const { canvas, bindings, frames, flush } = createPreviewLifecycle();
    const transform = vi.spyOn(canvas.contextTop, 'transform');
    requestEditorFreehandPreview(bindings);
    if (order === 'after') flush();
    const previous = mocks.renderPreview.mock.calls.length;
    canvas.viewportTransform = [2, 0, 0, 2, 13, 27];
    canvas.renderAll();
    expect(transform).toHaveBeenLastCalledWith(2, 0, 0, 2, 13, 27);
    expect(mocks.renderPreview).toHaveBeenCalledTimes(previous + 1);
    expect(frames.size).toBe(0);
    flush();
    expect(mocks.renderPreview).toHaveBeenCalledTimes(previous + 1);
    canvas.destroy();
  }
);

it.each(['end', 'replace', 'detachCanvas', 'cancel', 'dispose', 'visible'] as const)(
  'does not paint queued previews after %s',
  (transition) => {
    const fixture = createPreviewLifecycle();
    requestEditorFreehandPreview(fixture.bindings);
    if (transition === 'cancel') cancelEditorFreehandPreview(fixture.canvas);
    else if (transition === 'dispose') fixture.canvas.disposed = true;
    else if (transition === 'visible') fixture.object.visible = true;
    else fixture[transition]();
    fixture.flush();
    expect(mocks.renderPreview).not.toHaveBeenCalled();
    fixture.canvas.destroy();
  }
);
