/* eslint-disable max-lines-per-function -- binding coverage keeps adapter view and mutators together */
import { describe, expect, it, vi } from 'vitest';
import { createEditorControllerPublicApiAdapter } from './bindings';

function createController() {
  return {
    activeTool: 'select',
    applyDocument: vi.fn(),
    browserFrameRenderToken: 4,
    canvas: { id: 'canvas' },
    canvasDocumentSize: { height: 80, width: 120 },
    clearSelection: vi.fn(),
    clearCropSelection: vi.fn(),
    commitHistory: vi.fn(),
    cropGuide: { id: 'guide' },
    cropSelection: { id: 'selection' },
    drawSession: { id: 'draw' },
    ensureBrowserFrameOnTop: vi.fn(),
    ensureObjectReachable: vi.fn(() => true),
    ensureReachableObjects: vi.fn(),
    focusObjectInViewport: vi.fn(),
    history: { id: 'history' },
    lastLayerSelectionAnchorId: 'layer-1',
    layerMutationToken: 3,
    logBrowserFrame: vi.fn(),
    nextLabelIndex: vi.fn(() => 7),
    originalDocument: { id: 'document' },
    panSession: { id: 'pan' },
    prepareObject: vi.fn(),
    rebuildFrameDecorations: vi.fn(),
    relayoutScene: vi.fn(),
    copyRenderedImage: vi.fn(async () => undefined),
    renderToDataUrl: vi.fn(() => 'data:image/png;base64,rendered'),
    scheduleZoomToFit: vi.fn(),
    sendFrameObjectsToBack: vi.fn(),
    source: { id: 'source' },
    switchToSelectTool: vi.fn(),
    syncRuntimeState: vi.fn(),
    toolModeEnabled: false,
    viewportDevicePixelRatioBaseline: 2,
    withHistoryMuted: vi.fn((callback: () => unknown) => callback()),
    zoomLevel: 1.25,
  };
}

describe('editor-controller public api bindings', () => {
  it('creates a mutable adapter view with forwarded methods and layer mutation helpers', () => {
    const controller = createController();
    const adapter = createEditorControllerPublicApiAdapter(controller as never);

    expect(adapter.canvas).toBe(controller.canvas);
    expect(adapter.source).toBe(controller.source);
    expect(adapter.lastLayerSelectionAnchorId).toBe('layer-1');

    adapter.prepareObject({ id: 'object' } as never);
    adapter.nextLabelIndex('image');
    adapter.commitHistory();
    adapter.syncRuntimeState();
    adapter.ensureObjectReachable({ id: 'object' } as never);
    adapter.focusObjectInViewport({ id: 'object' } as never);
    adapter.ensureReachableObjects();
    adapter.rebuildFrameDecorations();
    adapter.sendFrameObjectsToBack();
    adapter.ensureBrowserFrameOnTop();
    adapter.logBrowserFrame('sync', { ok: true });
    adapter.relayoutScene({ id: 'frame' } as never, { id: 'browser' } as never, {
      preserveCanvasSize: true,
    });
    adapter.scheduleZoomToFit();
    adapter.applyDocument({ id: 'doc' } as never, { resetHistory: false, updateOriginal: false });
    expect(adapter.renderToDataUrl({ format: 'png', quality: 0.8 })).toBe(
      'data:image/png;base64,rendered'
    );
    void adapter.copyRenderedImage({ outputSize: { width: 320, height: 180 } });
    adapter.switchToSelectTool();
    adapter.clearSelection();
    adapter.clearCropSelection();

    adapter.setCanvasDocumentSize({ height: 100, width: 200 } as never);
    adapter.setSource({ id: 'next-source' } as never);
    adapter.setOriginalDocument({ id: 'next-doc' } as never);
    adapter.setHistory({ id: 'next-history' } as never);
    adapter.setActiveTool('crop');
    adapter.setZoomLevel(2);
    adapter.setDrawSession({ id: 'next-draw' } as never);
    adapter.setCropState({ id: 'next-guide' } as never, { id: 'next-selection' } as never);
    adapter.setPanSession({ id: 'next-pan' } as never);
    adapter.setLayerMutationToken(9);
    adapter.setLastLayerSelectionAnchorId('layer-9');

    expect(adapter.createLayerMutationToken()).toBe(10);
    expect(adapter.isLayerMutationTokenCurrent(10)).toBe(true);
    expect(adapter.createBrowserFrameRenderToken()).toBe(5);
    expect(adapter.isBrowserFrameRenderTokenCurrent(5)).toBe(true);
    expect(adapter.withHistoryMuted(() => 'result')).toBe('result');

    expect(controller.prepareObject).toHaveBeenCalled();
    expect(controller.nextLabelIndex).toHaveBeenCalledWith('image');
    expect(controller.logBrowserFrame).toHaveBeenCalledWith('sync', { ok: true });
    expect(controller.relayoutScene).toHaveBeenCalled();
    expect(controller.applyDocument).toHaveBeenCalled();
    expect(controller.copyRenderedImage).toHaveBeenCalledWith({
      outputSize: { height: 180, width: 320 },
    });
    expect(controller.clearSelection).toHaveBeenCalledOnce();
    expect(controller.clearCropSelection).toHaveBeenCalledOnce();
    expect(controller.canvasDocumentSize).toEqual({ height: 100, width: 200 });
    expect(controller.source).toEqual({ id: 'next-source' });
    expect(controller.originalDocument).toEqual({ id: 'next-doc' });
    expect(controller.history).toEqual({ id: 'next-history' });
    expect(controller.activeTool).toBe('crop');
    expect(controller.toolModeEnabled).toBe(true);
    expect(controller.zoomLevel).toBe(2);
    expect(controller.drawSession).toEqual({ id: 'next-draw' });
    expect(controller.cropGuide).toEqual({ id: 'next-guide' });
    expect(controller.cropSelection).toEqual({ id: 'next-selection' });
    expect(controller.panSession).toEqual({ id: 'next-pan' });
    expect(controller.lastLayerSelectionAnchorId).toBe('layer-9');
    expect(controller.browserFrameRenderToken).toBe(5);
  });

  it('exposes live controller state instead of snapshotting mutable scene fields', () => {
    const controller = createController();
    const adapter = createEditorControllerPublicApiAdapter(controller as never);

    controller.canvasDocumentSize = { height: 420, width: 700 };
    controller.source = { id: 'next-source' };
    controller.activeTool = 'crop';

    expect(adapter.canvasDocumentSize).toEqual({ height: 420, width: 700 });
    expect(adapter.source).toEqual({ id: 'next-source' });
    expect(adapter.activeTool).toBe('crop');
  });

  it('keeps adapter methods bound to the underlying controller instance', () => {
    const preparedObjects: unknown[] = [];
    const controller = {
      ...createController(),
      bound: true,
      prepareObject(this: { bound: boolean }, object: unknown) {
        if (!this.bound) {
          throw new Error('lost adapter prepareObject binding');
        }
        preparedObjects.push(object);
      },
    };
    const adapter = createEditorControllerPublicApiAdapter(controller as never);
    const prepareObject = adapter.prepareObject;
    const object = { id: 'object' };

    expect(() => prepareObject(object as never)).not.toThrow();
    expect(preparedObjects).toEqual([object]);
  });
});
