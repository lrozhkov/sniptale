// @vitest-environment jsdom

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
    setState: vi.fn(),
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

import { clearSelectionForController, setActiveToolForController } from './lifecycle';

function createLifecycleController() {
  return {
    activeTool: 'select',
    applyToolMode: vi.fn(),
    autosaveService: null,
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
    rasterToolSession: { selection: null },
    scheduleViewportStateSync: vi.fn(),
    selectionNudgeSession: null,
    stageElement: null,
    syncRuntimeState: vi.fn(),
    syncViewportState: vi.fn(),
    toolModeEnabled: true,
    viewportElement: null,
    viewportResizeObserver: null as ResizeObserver | null,
    viewportSyncFrame: 0,
    viewportDevicePixelRatioBaseline: 1,
    zoomLevel: 2,
  };
}

function registerToolSwitchTest() {
  it('keeps the current layer selection and refreshes runtime state when switching tools', async () => {
    const discardActiveObject = vi.fn();
    const requestRenderAll = vi.fn();
    const controller = {
      ...createLifecycleController(),
      canvas: {
        discardActiveObject,
        getActiveObjects: () => [{ sniptaleId: 'layer-1' }],
        requestRenderAll,
      },
    };

    setActiveToolForController(controller as never, 'text');

    expect(controller.activeTool).toBe('text');
    expect(discardActiveObject).not.toHaveBeenCalled();
    expect(requestRenderAll).not.toHaveBeenCalled();
    expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
    expect(controller.applyToolMode).not.toHaveBeenCalled();
  });
}

function registerClearSelectionTest() {
  it('clears active canvas selection without changing tool mode state', async () => {
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

    clearSelectionForController(controller as never);

    expect(discardActiveObject).toHaveBeenCalledOnce();
    expect(requestRenderAll).toHaveBeenCalledOnce();
    expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
    expect(controller.activeTool).toBe('rectangle');
    expect(controller.toolModeEnabled).toBe(true);
    expect(controller.applyToolMode).not.toHaveBeenCalled();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('editor controller lifecycle selection actions', () => {
  registerToolSwitchTest();
  registerClearSelectionTest();
});
