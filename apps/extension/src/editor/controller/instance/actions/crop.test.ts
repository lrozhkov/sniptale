import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditorControllerCropSelectionMock: vi.fn(),
  applyEditorViewportZoomMock: vi.fn(),
  cancelEditorControllerCropModeMock: vi.fn(),
  clearEditorCanvasSizePreviewMock: vi.fn(),
  clearEditorControllerCropSelectionMock: vi.fn(),
  previewEditorCanvasSizeSelectionMock: vi.fn(),
  debugMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: mocks.debugMock,
  }),
}));

vi.mock('../../crop-workflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../crop-workflow')>()),
  applyEditorControllerCropSelection: mocks.applyEditorControllerCropSelectionMock,
  cancelEditorControllerCropMode: mocks.cancelEditorControllerCropModeMock,
  clearEditorCanvasSizePreview: mocks.clearEditorCanvasSizePreviewMock,
  clearEditorControllerCropSelection: mocks.clearEditorControllerCropSelectionMock,
  previewEditorCanvasSizeSelection: mocks.previewEditorCanvasSizeSelectionMock,
}));

vi.mock('../../viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../viewport')>()),
  applyEditorViewportZoom: mocks.applyEditorViewportZoomMock,
}));

import {
  applyCropSelectionForController,
  cancelCropModeForController,
  clearCanvasSizePreviewForController,
  clearCropSelectionForController,
  previewCanvasSizeForController,
} from './crop';

beforeEach(() => {
  vi.clearAllMocks();
});

function createController() {
  return {
    applyDocument: vi.fn(),
    canvas: { id: 'canvas' },
    canvasDocumentSize: { width: 800, height: 600 },
    clearCropSelection: vi.fn(),
    commitHistory: vi.fn(),
    cropGuide: { id: 'guide' },
    cropSelection: { id: 'selection' },
    drawSession: { tool: 'crop' },
    rebuildFrameDecorations: vi.fn(),
    renderToDataUrl: vi.fn(),
    setCanvasDocumentSize: vi.fn(),
    setSource: vi.fn(),
    source: { id: 'source' },
    switchToSelectTool: vi.fn(),
    syncRuntimeState: vi.fn(),
    viewportDevicePixelRatioBaseline: 1,
    zoomLevel: 1,
  };
}

function expectClearedCropSelection(controller: ReturnType<typeof createController>) {
  expect(controller.cropGuide).toBeNull();
  expect(controller.cropSelection).toBeNull();
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
}

function expectSuccessfulCropApply(controller: ReturnType<typeof createController>) {
  expect(controller.cropGuide).toBeNull();
  expect(controller.cropSelection).toBeNull();
  expect(controller.renderToDataUrl).not.toHaveBeenCalled();
  expect(controller.canvasDocumentSize).toEqual({ height: 60, width: 100 });
  expect(controller.source).toEqual({ id: 'next-source' });
  expect(controller.switchToSelectTool).toHaveBeenCalledOnce();
  expect(controller.applyDocument).not.toHaveBeenCalled();
  expect(controller.rebuildFrameDecorations).toHaveBeenCalledOnce();
  expect(mocks.applyEditorViewportZoomMock).toHaveBeenCalledOnce();
  expect(controller.commitHistory).toHaveBeenCalledOnce();
  expect(mocks.debugMock).toHaveBeenCalledWith('apply:start', { crop: 'selection' });
}

function mockSuccessfulCropApply() {
  mocks.applyEditorControllerCropSelectionMock.mockImplementationOnce(async (args) => {
    args.setCanvasDocumentSize({ height: 60, width: 100 });
    args.setSource({ id: 'next-source' });
    args.syncViewportTransform();
    await args.rebuildFrameDecorations();
    args.setCropState({ cropGuide: null, cropSelection: null });
    args.switchToSelectTool();
    args.commitHistory();
    args.logCrop('apply:start', { crop: 'selection' });
    return { cropGuide: null, cropSelection: null };
  });
}

it('updates controller state when the crop workflow returns next-state payloads', async () => {
  const controller = createController();

  mocks.clearEditorControllerCropSelectionMock.mockReturnValueOnce({
    cropGuide: null,
    cropSelection: null,
  });
  clearCropSelectionForController(controller as never);
  expectClearedCropSelection(controller);

  controller.cropGuide = { id: 'guide' };
  controller.cropSelection = { id: 'selection' };
  mocks.previewEditorCanvasSizeSelectionMock.mockReturnValueOnce({
    cropGuide: { id: 'preview' },
    cropSelection: { id: 'preview-selection' },
  });
  previewCanvasSizeForController(controller as never, 400, 300);
  expect(controller.cropGuide).toEqual({ id: 'preview' });
  expect(controller.cropSelection).toEqual({ id: 'preview-selection' });
  expect(controller.syncRuntimeState).toHaveBeenCalledTimes(2);

  mocks.clearEditorCanvasSizePreviewMock.mockReturnValueOnce({
    cropGuide: null,
    cropSelection: null,
  });
  clearCanvasSizePreviewForController(controller as never);
  expect(controller.cropGuide).toBeNull();
  expect(controller.cropSelection).toBeNull();
  expect(controller.syncRuntimeState).toHaveBeenCalledTimes(3);

  controller.cropGuide = { id: 'guide' };
  controller.cropSelection = { id: 'selection' };
  mocks.cancelEditorControllerCropModeMock.mockReturnValueOnce({
    drawSession: null,
    cropSelection: { id: 'next-selection' },
  });
  cancelCropModeForController(controller as never);
  expect(controller.drawSession).toBeNull();
  expect(controller.cropSelection).toEqual({ id: 'next-selection' });

  mockSuccessfulCropApply();
  await applyCropSelectionForController(controller as never);
  expectSuccessfulCropApply(controller);
});

it('keeps controller fields untouched when the workflow returns null', async () => {
  const controller = createController();

  mocks.clearEditorControllerCropSelectionMock.mockReturnValueOnce(null);
  clearCropSelectionForController(controller as never);
  expect(controller.cropGuide).toEqual({ id: 'guide' });
  expect(controller.cropSelection).toEqual({ id: 'selection' });
  expect(controller.syncRuntimeState).not.toHaveBeenCalled();

  mocks.cancelEditorControllerCropModeMock.mockReturnValueOnce(null);
  cancelCropModeForController(controller as never);
  expect(controller.drawSession).toEqual({ tool: 'crop' });

  mocks.previewEditorCanvasSizeSelectionMock.mockReturnValueOnce(null);
  previewCanvasSizeForController(controller as never, 400, 300);
  expect(controller.cropGuide).toEqual({ id: 'guide' });

  mocks.clearEditorCanvasSizePreviewMock.mockReturnValueOnce(null);
  clearCanvasSizePreviewForController(controller as never);
  expect(controller.cropGuide).toEqual({ id: 'guide' });

  mocks.applyEditorControllerCropSelectionMock.mockResolvedValueOnce(null);
  await applyCropSelectionForController(controller as never);
  expect(controller.cropGuide).toEqual({ id: 'guide' });
  expect(controller.cropSelection).toEqual({ id: 'selection' });
});
