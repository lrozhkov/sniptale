import { FabricObject, Point } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  createFabricCanvasFixture,
  createTypedTestFixture,
} from '../../testing/fabric-canvas.test-support';

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

import { createAfterRenderHandler } from './runtime.render';

beforeEach(() => vi.clearAllMocks());

it('draws an invisible freehand draft on the top canvas with the viewport transform', () => {
  const object = new FabricObject({ visible: false });
  const drawing = { id: 'pencil-1', kind: 'pencil' };
  const context = createTypedTestFixture<CanvasRenderingContext2D>({
    restore: vi.fn(),
    save: vi.fn(),
    transform: vi.fn(),
  });
  mocks.readDrawing.mockReturnValue(drawing);
  const handler = createAfterRenderHandler({
    getActiveCropRect: () => null,
    getCanvas: () =>
      createFabricCanvasFixture({
        contextTop: context,
        getSelectionContext: () => context,
        viewportTransform: [2, 0, 0, 2, 10, 20],
      }),
    getCanvasDocumentSize: () => ({ height: 100, width: 200 }),
    getDrawSession: () => ({
      object,
      objectId: 'pencil-1',
      pointerId: 7,
      start: new Point(0, 0),
      tool: 'pencil',
    }),
  });

  handler();

  expect(context.transform).toHaveBeenCalledWith(2, 0, 0, 2, 10, 20);
  expect(mocks.renderPreview).toHaveBeenCalledWith(context, drawing);
  expect(context.restore).toHaveBeenCalledOnce();
});

it('keeps the crop overlay while ignoring an invisible non-freehand draft', () => {
  const object = new FabricObject({ visible: false });
  const context = createTypedTestFixture<CanvasRenderingContext2D>({
    fillRect: vi.fn(),
    fillStyle: '',
    restore: vi.fn(),
    save: vi.fn(),
    transform: vi.fn(),
  });
  mocks.readDrawing.mockReturnValue({ id: 'shape-1', kind: 'rectangle' });
  const handler = createAfterRenderHandler({
    getActiveCropRect: () =>
      createTypedTestFixture<import('fabric').Rect>({
        getBoundingRect: () => ({ height: 40, left: 20, top: 10, width: 80 }),
      }),
    getCanvas: () =>
      createFabricCanvasFixture({
        contextTop: context,
        getSelectionContext: () => context,
        viewportTransform: [1, 0, 0, 1, 0, 0],
      }),
    getCanvasDocumentSize: () => ({ height: 100, width: 200 }),
    getDrawSession: () => ({
      object,
      objectId: 'shape-1',
      pointerId: 7,
      start: new Point(0, 0),
      tool: 'shape',
    }),
  });

  handler();

  expect(mocks.renderPreview).not.toHaveBeenCalled();
  expect(context.fillRect).toHaveBeenCalledTimes(4);
  expect(context.fillRect).toHaveBeenLastCalledWith(100, 10, 100, 40);
  expect(context.restore).toHaveBeenCalledOnce();
});

it.each([
  { object: undefined, title: 'a missing object' },
  { object: new FabricObject({ visible: true }), title: 'a visible object' },
])('skips preview work for $title', ({ object }) => {
  const context = createTypedTestFixture<CanvasRenderingContext2D>({
    restore: vi.fn(),
    save: vi.fn(),
    transform: vi.fn(),
  });
  const handler = createAfterRenderHandler({
    getActiveCropRect: () => null,
    getCanvas: () =>
      createFabricCanvasFixture({
        contextTop: context,
        getSelectionContext: () => context,
        viewportTransform: [1, 0, 0, 1, 0, 0],
      }),
    getCanvasDocumentSize: () => ({ height: 100, width: 200 }),
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

  handler();

  expect(mocks.readDrawing).not.toHaveBeenCalled();
  expect(mocks.renderPreview).not.toHaveBeenCalled();
});
