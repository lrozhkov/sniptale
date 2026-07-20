// @vitest-environment jsdom
/* eslint-disable max-lines-per-function -- lifecycle regression suite keeps related flows together */
import { beforeEach, describe, expect, it, vi } from 'vitest';
const lifecycleMocks = vi.hoisted(() => {
  const magnetManager = { dispose: vi.fn(), hasActiveGuides: vi.fn(() => false) };
  return {
    applyEditorViewportZoom: vi.fn(),
    attachEditorControllerEventHandlers: vi.fn(() => ({ disconnect: vi.fn() })),
    closeEditorDocumentViaController: vi.fn(),
    copyRenderedEditorImageViaController: vi.fn(async () => undefined),
    createEditorMagnetManager: vi.fn(() => magnetManager),
    detachEditorControllerEventHandlers: vi.fn(),
    exportEditorDocumentViaController: vi.fn(() => ({ version: 1 })),
    getEditorViewportDevicePixelRatioBaseline: vi.fn(() => 1),
    loadEditorDocumentViaController: vi.fn(async () => undefined),
    magnetManager,
    openEditorImageViaController: vi.fn(async () => undefined),
    refreshEditorViewportPresentation: vi.fn(),
    renderEditorControllerToDataUrl: vi.fn(() => 'data:image/png;base64,lifecycle'),
  };
});
vi.mock('fabric', () => ({
  Canvas: class MockCanvas {
    backgroundColor = '';
    dispose = vi.fn();
    setDimensions = vi.fn();
    setZoom = vi.fn();
  },
  PencilBrush: class MockPencilBrush {},
}));
vi.mock('../../events', () => ({
  attachEditorControllerEventHandlers: lifecycleMocks.attachEditorControllerEventHandlers,
  createEditorControllerEventHandlers: vi.fn(),
  detachEditorControllerEventHandlers: lifecycleMocks.detachEditorControllerEventHandlers,
  EditorControllerEventHandlers: undefined,
}));
vi.mock('../../magnet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../magnet')>()),
  createEditorMagnetManager: lifecycleMocks.createEditorMagnetManager,
}));
vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      workspace: {
        backgroundColor: '#ffffff',
        gridColor: '#d1d5db',
        gridEnabled: false,
        gridSize: 24,
        gridSnapEnabled: false,
        magnetEnabled: false,
      },
    }),
  },
}));
vi.mock('../../public-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api')>()),
  closeEditorDocumentViaController: lifecycleMocks.closeEditorDocumentViaController,
  copyRenderedEditorImageViaController: lifecycleMocks.copyRenderedEditorImageViaController,
  exportEditorDocumentViaController: lifecycleMocks.exportEditorDocumentViaController,
  loadEditorDocumentViaController: lifecycleMocks.loadEditorDocumentViaController,
  openEditorImageViaController: lifecycleMocks.openEditorImageViaController,
  renderEditorControllerToDataUrl: lifecycleMocks.renderEditorControllerToDataUrl,
}));
vi.mock('../../viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../viewport')>()),
  applyEditorViewportZoom: lifecycleMocks.applyEditorViewportZoom,
  getEditorViewportDevicePixelRatioBaseline:
    lifecycleMocks.getEditorViewportDevicePixelRatioBaseline,
}));
vi.mock('../../viewport/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../viewport/actions')>()),
  refreshEditorViewportPresentation: lifecycleMocks.refreshEditorViewportPresentation,
}));
const rasterSessionMocks = vi.hoisted(() => ({
  clearEditorRasterSelection: vi.fn(),
  clearEditorRasterTransientState: vi.fn(),
}));
vi.mock('../../raster-tools/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../raster-tools/session')>()),
  clearEditorRasterSelection: rasterSessionMocks.clearEditorRasterSelection,
  clearEditorRasterTransientState: rasterSessionMocks.clearEditorRasterTransientState,
}));
import {
  clearSelectionForController,
  closeDocumentForController,
  copyRenderedImageForController,
  disposeEditorController,
  exportDocumentForController,
  loadDocumentForController,
  mountEditorController,
  openImageForController,
  renderToDataUrlForController,
  setActiveToolForController,
  suspendToolModeForController,
} from './lifecycle';
import { ensureEditorCanvasReadyHandoff } from '../../../document/canvas-ready/handoff';
function createLifecycleController() {
  return {
    activeTool: 'select',
    toolModeEnabled: true,
    autosaveService: {
      discardDraft: vi.fn(async () => undefined),
      persistSnapshot: vi.fn(async (getDocument: () => unknown) => {
        getDocument();
      }),
    },
    applyToolMode: vi.fn(),
    buildViewportState: vi.fn(),
    canvas: null as unknown,
    canvasDocumentSize: { height: 0, width: 0 },
    cropGuide: null,
    dispose: vi.fn(),
    drawSession: null,
    eventHandlers: {},
    exportDocument: vi.fn(() => ({ version: 1 })),
    getPublicApiAdapter: vi.fn(() => ({ adapter: true })),
    isSpacePressed: false,
    magnetManager: null,
    panSession: null,
    scheduleViewportStateSync: vi.fn(),
    stageElement: null,
    syncRuntimeState: vi.fn(),
    syncViewportState: vi.fn(),
    rasterToolSession: { selection: null },
    selectionNudgeSession: null as { code: string; step: number } | null,
    viewportElement: null,
    viewportResizeObserver: null as ResizeObserver | null,
    viewportSyncFrame: 0,
    viewportDevicePixelRatioBaseline: 1,
    zoomLevel: 2,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
});
describe('editor controller lifecycle actions', () => {
  it('mounts, exports, persists, and disposes through the controller-owned lifecycle', async () => {
    const controller = createLifecycleController();
    const canvasElement = document.createElement('canvas');
    const viewportElement = document.createElement('div');
    const stageElement = document.createElement('div');
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);
    const canvasReadyHandoff = ensureEditorCanvasReadyHandoff(controller);
    const canvasReady = canvasReadyHandoff.wait();
    mountEditorController(controller as never, canvasElement, viewportElement, stageElement);
    await expect(canvasReady).resolves.toBeUndefined();
    expect(controller.dispose).not.toHaveBeenCalled();
    expect(lifecycleMocks.attachEditorControllerEventHandlers).toHaveBeenCalledOnce();
    expect(rasterSessionMocks.clearEditorRasterSelection).toHaveBeenCalledTimes(1);
    expect(controller.selectionNudgeSession).toBeNull();
    const mountedCanvas = controller.canvas as { dispose: ReturnType<typeof vi.fn> };
    await openImageForController(controller as never, 'data:image/png;base64,open', 'open.png');
    await loadDocumentForController(controller as never, { version: 1 } as never);
    closeDocumentForController(controller as never);
    exportDocumentForController(controller as never);
    renderToDataUrlForController(controller as never, { format: 'png', quality: 0.8 });
    await copyRenderedImageForController(controller as never, {
      outputSize: { width: 640, height: 360 },
    });
    clearSelectionForController(controller as never);
    setActiveToolForController(controller as never, 'crop');
    expect(lifecycleMocks.openEditorImageViaController).toHaveBeenCalledOnce();
    expect(lifecycleMocks.loadEditorDocumentViaController).toHaveBeenCalledOnce();
    expect(controller.autosaveService.persistSnapshot).toHaveBeenCalledTimes(2);
    expect(controller.autosaveService.discardDraft).toHaveBeenCalledOnce();
    expect(lifecycleMocks.closeEditorDocumentViaController).toHaveBeenCalledOnce();
    expect(lifecycleMocks.exportEditorDocumentViaController).toHaveBeenCalledOnce();
    expect(lifecycleMocks.renderEditorControllerToDataUrl).toHaveBeenCalledWith(
      { adapter: true },
      { format: 'png', quality: 0.8 }
    );
    expect(lifecycleMocks.copyRenderedEditorImageViaController).toHaveBeenCalledWith(
      { adapter: true },
      { outputSize: { height: 360, width: 640 } }
    );
    expect(controller.syncRuntimeState).toHaveBeenCalledTimes(2);
    expect(controller.activeTool).toBe('crop');
    controller.viewportSyncFrame = 11;
    controller.selectionNudgeSession = { code: 'ArrowLeft', step: 1 };
    disposeEditorController(controller as never);
    await expect(canvasReadyHandoff.wait()).rejects.toThrow('Editor canvas is disposed');
    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(11);
    expect(lifecycleMocks.detachEditorControllerEventHandlers).toHaveBeenCalledOnce();
    expect(lifecycleMocks.magnetManager.dispose).toHaveBeenCalledOnce();
    expect(rasterSessionMocks.clearEditorRasterTransientState).toHaveBeenCalledWith(
      controller.rasterToolSession
    );
    expect(rasterSessionMocks.clearEditorRasterSelection).toHaveBeenCalledTimes(2);
    expect(mountedCanvas.dispose).toHaveBeenCalledOnce();
    expect(controller.canvas).toBeNull();
    expect(controller.selectionNudgeSession).toBeNull();
  });
  it('keeps null-canvas disposal and autosave-optional flows safe', async () => {
    const controller = {
      ...createLifecycleController(),
      autosaveService: null,
      canvas: null,
      magnetManager: lifecycleMocks.magnetManager,
    };
    disposeEditorController(controller as never);
    await openImageForController(controller as never, 'data:image/png;base64,open');
    await loadDocumentForController(controller as never, { version: 2 } as never);
    expect(lifecycleMocks.detachEditorControllerEventHandlers).not.toHaveBeenCalled();
    expect(lifecycleMocks.magnetManager.dispose).not.toHaveBeenCalled();
    expect(rasterSessionMocks.clearEditorRasterTransientState).not.toHaveBeenCalled();
  });
  it('suspends tool mode by clearing selection and syncing runtime state', async () => {
    const discardActiveObject = vi.fn();
    const requestRenderAll = vi.fn();
    const controller = {
      ...createLifecycleController(),
      activeTool: 'rectangle',
      canvas: {
        discardActiveObject,
        getActiveObjects: () => [{ sniptaleId: 'layer-1' }],
        requestRenderAll,
      },
    };
    suspendToolModeForController(controller as never);
    expect(controller.activeTool).toBe('select');
    expect(controller.toolModeEnabled).toBe(false);
    expect(discardActiveObject).toHaveBeenCalledOnce();
    expect(requestRenderAll).toHaveBeenCalledOnce();
    expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
    expect(controller.applyToolMode).toHaveBeenCalledOnce();
  });
  it('re-enables suspended tool mode when setting the active tool', async () => {
    const controller = {
      ...createLifecycleController(),
      toolModeEnabled: false,
    };
    setActiveToolForController(controller as never, 'select');
    expect(controller.activeTool).toBe('select');
    expect(controller.toolModeEnabled).toBe(true);
    expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
  });
  it('syncs runtime state when suspending without an active canvas selection', async () => {
    const controller = {
      ...createLifecycleController(),
      activeTool: 'select',
      canvas: {
        discardActiveObject: vi.fn(),
        getActiveObjects: () => [],
        requestRenderAll: vi.fn(),
      },
    };
    suspendToolModeForController(controller as never);
    expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
    expect(controller.canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(controller.canvas.requestRenderAll).not.toHaveBeenCalled();
  });
  it('keeps clearSelection as a no-op for empty or missing canvas selection', async () => {
    const emptyCanvasController = {
      ...createLifecycleController(),
      canvas: {
        discardActiveObject: vi.fn(),
        getActiveObjects: () => [],
        requestRenderAll: vi.fn(),
      },
    };
    const nullCanvasController = createLifecycleController();
    clearSelectionForController(emptyCanvasController as never);
    clearSelectionForController(nullCanvasController as never);
    expect(emptyCanvasController.canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(emptyCanvasController.canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(emptyCanvasController.syncRuntimeState).not.toHaveBeenCalled();
    expect(nullCanvasController.syncRuntimeState).not.toHaveBeenCalled();
  });
  it('keeps viewport resize compensation advisory and leaves controller zoom untouched', async () => {
    const controller = createLifecycleController();
    const canvasElement = document.createElement('canvas');
    const viewportElement = document.createElement('div');
    const stageElement = document.createElement('div');
    mountEditorController(controller as never, canvasElement, viewportElement, stageElement);
    const eventHandlerCalls = lifecycleMocks.attachEditorControllerEventHandlers.mock
      .calls as unknown as Array<[{ onViewportResize?: () => void }]>;
    const resizeHandlerArgs = eventHandlerCalls[0]?.[0];
    const onViewportResize = resizeHandlerArgs?.onViewportResize;
    expect(onViewportResize).toBeTypeOf('function');
    onViewportResize?.();
    expect(controller.scheduleViewportStateSync).not.toHaveBeenCalled();
    expect(lifecycleMocks.refreshEditorViewportPresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        canvas: controller.canvas,
        canvasDocumentSize: controller.canvasDocumentSize,
        devicePixelRatioBaseline: 1,
        stageElement,
        viewportElement,
        zoomLevel: 1,
      })
    );
    expect(controller.zoomLevel).toBe(1);
    expect(lifecycleMocks.applyEditorViewportZoom).toHaveBeenCalledOnce();
  });
});
