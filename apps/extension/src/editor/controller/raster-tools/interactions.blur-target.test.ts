import { Point } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';
import { createEditorRasterToolSession } from './session';
import { handleRasterToolMouseDown, handleRasterToolMouseMove } from './interactions';

const mocks = vi.hoisted(() => ({
  createRasterTargetSnapshot: vi.fn(),
  eraseRasterBitmap: vi.fn(),
  floodFillRasterBitmap: vi.fn(),
  resolveBitmapPoint: vi.fn(),
  resolveRasterTarget: vi.fn(),
  resolveRasterTargetState: vi.fn(),
}));

vi.mock('../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/target')>()),
  createRasterTargetSnapshot: mocks.createRasterTargetSnapshot,
  resolveBitmapPoint: mocks.resolveBitmapPoint,
  resolveRasterTarget: mocks.resolveRasterTarget,
  resolveRasterTargetState: mocks.resolveRasterTargetState,
}));

vi.mock('../raster/mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/mutations')>()),
  eraseRasterBitmap: mocks.eraseRasterBitmap,
  floodFillRasterBitmap: mocks.floodFillRasterBitmap,
}));

function createBindings(activeTool: 'selection' | 'fill' | 'eraser') {
  const session = createEditorRasterToolSession();
  const applyRasterBitmap = vi.fn(async () => undefined);
  return {
    applyRasterBitmap,
    bindings: {
      applyRasterBitmap,
      getActiveTool: () => activeTool,
      getCanvas: () => ({}) as never,
      getRasterToolSession: () => session,
    },
    session,
  };
}

function createBlurRasterEvent(canvas: unknown, blurTarget: unknown) {
  return {
    canvas: canvas as never,
    event: { e: {} as never, target: blurTarget as never },
  };
}

async function expectRasterToolMouseDownHandled(args: {
  bindings: ReturnType<typeof createBindings>;
  blurTarget: unknown;
  canvas: unknown;
}) {
  expect(
    await handleRasterToolMouseDown(
      args.bindings.bindings as never,
      createBlurRasterEvent(args.canvas, args.blurTarget)
    )
  ).toBe(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveRasterTarget.mockReturnValue({
    object: { sniptaleId: 'blur-1', sniptaleType: 'blur' },
    reference: { kind: 'object', objectId: 'blur-1', objectName: 'Blur 1' },
  });
  mocks.resolveRasterTargetState.mockReturnValue({
    summary: {
      status: 'will-rasterize',
      layerId: 'blur-1',
      layerName: 'Blur 1',
    },
    target: {
      object: { sniptaleId: 'blur-1', sniptaleType: 'blur' },
      reference: { kind: 'object', objectId: 'blur-1', objectName: 'Blur 1' },
    },
  });
  mocks.createRasterTargetSnapshot.mockResolvedValue({
    bitmap: { width: 20, height: 20 },
    reference: { kind: 'object', objectId: 'blur-1', objectName: 'Blur 1' },
    sceneBounds: { left: 10, top: 10, width: 20, height: 20 },
  });
  mocks.resolveBitmapPoint.mockReturnValue({ x: 10, y: 12 });
});

it('allows raster selection, fill, and eraser tools to rasterize blur layers', async () => {
  const canvas = {
    defaultCursor: 'crosshair',
    getScenePoint: () => new Point(30, 32),
  };
  const blurTarget = { sniptaleId: 'blur-1', sniptaleType: 'blur' };
  const eraser = createBindings('eraser');

  expect(
    handleRasterToolMouseMove(eraser.bindings as never, {
      canvas: canvas as never,
      event: { e: {} as never, target: blurTarget as never },
    })
  ).toBe(true);
  expect(canvas.defaultCursor).toBe('none');
  expect(eraser.session.hoverCursor).toEqual({ scenePoint: new Point(30, 32), tool: 'eraser' });

  await expectRasterToolMouseDownHandled({ bindings: eraser, blurTarget, canvas });
  expect(mocks.createRasterTargetSnapshot).toHaveBeenCalled();
  expect(mocks.resolveBitmapPoint).toHaveBeenCalled();
  expect(eraser.applyRasterBitmap).not.toHaveBeenCalled();

  const fill = createBindings('fill');
  await expectRasterToolMouseDownHandled({ bindings: fill, blurTarget, canvas });
  expect(mocks.floodFillRasterBitmap).toHaveBeenCalled();
  expect(fill.applyRasterBitmap).toHaveBeenCalledWith(
    { kind: 'object', objectId: 'blur-1', objectName: 'Blur 1' },
    expect.anything()
  );

  const selection = createBindings('selection');
  await expectRasterToolMouseDownHandled({ bindings: selection, blurTarget, canvas });
  expect(selection.session.marqueeDraft?.snapshot.reference).toEqual({
    kind: 'object',
    objectId: 'blur-1',
    objectName: 'Blur 1',
  });
});
