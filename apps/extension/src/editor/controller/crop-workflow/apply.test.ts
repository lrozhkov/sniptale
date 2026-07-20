import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearEditorCropGuideMock: vi.fn(),
  getEditorStoreStateMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  normalizeEditorCropSelectionMock: vi.fn(),
  setCropReadyMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ error: mocks.loggerErrorMock }),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: { getState: mocks.getEditorStoreStateMock },
}));

vi.mock('../tools/crop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/crop')>()),
  normalizeEditorCropSelection: mocks.normalizeEditorCropSelectionMock,
}));

vi.mock('../transient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../transient')>()),
  clearEditorCropGuide: mocks.clearEditorCropGuideMock,
}));

import { applyEditorControllerCropSelection } from './';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEditorStoreStateMock.mockReturnValue({
    browserFrame: { enabled: false },
    frame: { mode: 'frame' },
    setCropReady: mocks.setCropReadyMock,
  });
  mocks.clearEditorCropGuideMock.mockReturnValue({ cropGuide: null, cropSelection: null });
  mocks.normalizeEditorCropSelectionMock.mockReturnValue({
    left: 10,
    top: 20,
    width: 100,
    height: 60,
  });
});

function createLayerObject(
  sniptaleId: string,
  left: number,
  top: number,
  scaleX: number,
  scaleY: number
) {
  return {
    sniptaleId,
    sniptaleLabel: sniptaleId,
    sniptaleLocked: sniptaleId === 'source-image',
    sniptaleRole: sniptaleId === 'source-image' ? 'source' : 'annotation',
    sniptaleType: sniptaleId === 'source-image' ? 'source-image' : 'rectangle',
    left,
    top,
    scaleX,
    scaleY,
    getScaledWidth: vi.fn(() => 80),
    getScaledHeight: vi.fn(() => 40),
    set: vi.fn(function set(this: { left: number; top: number }, patch: object) {
      Object.assign(this, patch);
    }),
    setCoords: vi.fn(),
    visible: true,
  };
}

function createCropCanvas({ includeSource = true }: { includeSource?: boolean } = {}) {
  const sourceObject = createLayerObject('source-image', 15, 27, 1, 1);
  const shapeObject = createLayerObject('shape-1', 45, 70, 1.4, 0.75);
  const frameObject = createLayerObject('frame-1', 0, 0, 1, 1);
  frameObject.sniptaleRole = 'frame';
  const objects = includeSource
    ? [sourceObject, shapeObject, frameObject]
    : [shapeObject, frameObject];

  return {
    discardActiveObject: vi.fn(),
    getObjects: vi.fn(() => objects),
    remove: vi.fn(),
    setActiveObject: vi.fn(),
    setDimensions: vi.fn(),
    requestRenderAll: vi.fn(),
  };
}

function createApplyCropContext() {
  return {
    canvas: createCropCanvas(),
    commitHistory: vi.fn(),
    cropGuide: { id: 'guide' },
    logCrop: vi.fn(),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    setCanvasDocumentSize: vi.fn(),
    setCropState: vi.fn(),
    setSource: vi.fn(),
    switchToSelectTool: vi.fn(),
    syncViewportTransform: vi.fn(),
  };
}

function createSourceState(overrides: Record<string, unknown> = {}) {
  return {
    displayHeight: 40,
    displayWidth: 80,
    id: 'source-image',
    left: 15,
    locked: true,
    top: 27,
    visible: true,
    ...overrides,
  };
}

async function applyCropWithContext(
  context: ReturnType<typeof createApplyCropContext>,
  source: ReturnType<typeof createSourceState> | null
) {
  return applyEditorControllerCropSelection({
    canvas: context.canvas as never,
    cropGuide: context.cropGuide as never,
    cropSelection: { left: 1, top: 2, width: 30, height: 40 } as never,
    canvasDocumentSize: { width: 300, height: 200 },
    source: source as never,
    setCanvasDocumentSize: context.setCanvasDocumentSize,
    setCropState: context.setCropState,
    setSource: context.setSource,
    syncViewportTransform: context.syncViewportTransform,
    switchToSelectTool: context.switchToSelectTool,
    rebuildFrameDecorations: context.rebuildFrameDecorations,
    commitHistory: context.commitHistory,
    logCrop: context.logCrop,
  });
}

function expectCropApplySuccess(context: ReturnType<typeof createApplyCropContext>) {
  const [sourceObject, shapeObject, frameObject] = context.canvas.getObjects();
  if (!sourceObject || !shapeObject || !frameObject) {
    throw new Error('Expected source, shape, and frame objects');
  }

  expect(mocks.normalizeEditorCropSelectionMock).toHaveBeenCalledWith(
    { left: 1, top: 2, width: 30, height: 40 },
    { width: 300, height: 200 }
  );
  expect(context.canvas.setDimensions).toHaveBeenCalledWith({ height: 60, width: 100 });
  expect(context.setCanvasDocumentSize).toHaveBeenCalledWith({ height: 60, width: 100 });
  expect(sourceObject.set).toHaveBeenCalledWith({ left: 5, top: 7 });
  expect(shapeObject.set).toHaveBeenCalledWith({ left: 35, top: 50 });
  expect(frameObject.set).not.toHaveBeenCalled();
  expect(shapeObject.scaleX).toBe(1.4);
  expect(shapeObject.scaleY).toBe(0.75);
  expect(context.setSource).toHaveBeenCalledWith(
    expect.objectContaining({ displayHeight: 40, displayWidth: 80, id: 'source-image' })
  );
  expect(context.syncViewportTransform).toHaveBeenCalledOnce();
  expect(context.rebuildFrameDecorations).toHaveBeenCalledOnce();
  expect(context.canvas.remove).toHaveBeenCalledWith(context.cropGuide);
  expect(context.canvas.discardActiveObject).toHaveBeenCalledTimes(2);
  expect(context.canvas.requestRenderAll).toHaveBeenCalledTimes(2);
  expect(context.setCropState).toHaveBeenCalledWith({ cropGuide: null, cropSelection: null });
  expect(context.switchToSelectTool).toHaveBeenCalledOnce();
  expect(context.commitHistory).toHaveBeenCalledOnce();
  expect(context.logCrop).toHaveBeenNthCalledWith(2, 'apply:done', expect.any(Object));
}

it('applies crop selection as a canvas viewport change without rebuilding the document', async () => {
  const context = createApplyCropContext();

  const nextState = await applyCropWithContext(context, createSourceState());

  expectCropApplySuccess(context);
  expect(nextState).toEqual({ cropGuide: null, cropSelection: null });
});

it('handles crop source state when the source object is absent', async () => {
  const context = createApplyCropContext();
  context.canvas = createCropCanvas({ includeSource: false });

  await applyCropWithContext(context, createSourceState({ left: 100, top: 200 }));

  expect(context.setSource).toHaveBeenCalledWith(expect.objectContaining({ left: 90, top: 180 }));

  await applyCropWithContext(context, null);

  expect(context.setSource).toHaveBeenCalledWith(null);
  expect(context.commitHistory).toHaveBeenCalledTimes(2);
});

it('logs crop-apply failures and rethrows them', async () => {
  const error = new Error('crop failed');
  const context = createApplyCropContext();

  context.rebuildFrameDecorations.mockRejectedValueOnce(error);

  await expect(applyCropWithContext(context, createSourceState())).rejects.toThrow('crop failed');

  expect(context.canvas.setActiveObject).toHaveBeenCalledWith(context.cropGuide);
  expect(context.setCropState).not.toHaveBeenCalled();
  expect(mocks.loggerErrorMock).toHaveBeenCalledWith('apply failed', error);
});
